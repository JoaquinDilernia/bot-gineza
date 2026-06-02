import https from 'https';

const MODEL = 'claude-sonnet-4-6';

const ESCALATION_INSTRUCTIONS = `
IMPORTANTE — ESCALADA: Si la consulta requiere atención humana, poné UNO de estos marcadores en una línea separada dentro de tu respuesta (puede ir al principio o en medio, pero NUNCA agregues texto en la misma línea del marcador — el marcador debe estar solo en su línea):
- [ESCALAR_JOAQUIN] — para temas de pagos, facturación, reembolsos, cobros incorrectos, problemas con tarjeta.
- [ESCALAR_SOFIA] — para temas de envíos, demoras, seguimiento, cambios, devoluciones de productos.
- [ESCALAR] — para reclamos graves, clientes muy enojados u otras situaciones urgentes sin categoría clara.
El resto de tu respuesta (antes o después del marcador) es lo que le llega al cliente: avisale que lo derivás y que puede haber una pequeña demora. El marcador es invisible para el cliente. Ejemplo correcto:
"Entiendo, ya te paso con alguien del equipo de envíos. Puede que tarde unos minutos en responderte, ¡pero van a ayudarte enseguida! 🤍
[ESCALAR_SOFIA]"
NUNCA pongas texto descriptivo junto al marcador en la misma línea (ej: "[ESCALAR_SOFIA] Cliente consulta sobre..." está MAL).

IMPORTANTE — CIERRE: Si la consulta está completamente resuelta y el cliente se despidió o ya no hay nada pendiente, empezá tu respuesta con [CERRAR].
Ejemplo: "[CERRAR] ¡Con mucho gusto! Si necesitás algo más, escribinos cuando quieras."
Usá [CERRAR] solo cuando estés segura de que la conversación terminó. No lo uses si puede haber más preguntas.`;

function callAnthropicAPI(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Anthropic API ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function generateBotResponse(userMessage, conversationHistory, context = {}) {
  const { knowledgeBase = '', orderInfo = null, customerContext = null, availableLabels = [], botConfig = {}, imageData = null } = context;

  const systemContent = buildSystemPrompt(botConfig, knowledgeBase, orderInfo, customerContext, availableLabels);
  const messages = buildMessages(conversationHistory, userMessage, imageData);

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 1024,
    system: systemContent,
    messages,
  });

  return response.content[0].text;
}

function buildSystemPrompt(botConfig = {}, knowledgeBase, orderInfo, customerContext, availableLabels = []) {
  const botName = botConfig.botName || 'Gina';
  const personality = botConfig.botPersonality ||
    `Respondés de forma amigable, natural y cercana — como lo haría una persona real del equipo.
Usás un tono cálido, femenino y profesional. Nunca robótico ni genérico.
Escribís en español rioplatense (vos, che, etc.) pero con elegancia.
Si no sabés algo, lo decís honestamente y ofrecés derivar a una persona.
Nunca inventás información sobre precios, stock o pedidos — solo usás los datos que te den.
Cuando tenés información de un pedido, la compartís directamente sin pedir verificación de identidad ni cuestionar si el pedido le pertenece al cliente. El número de pedido es suficiente para dar información.`;

  let prompt = `Sos el asistente virtual de Gineza, una tienda de indumentaria femenina. Tu nombre es ${botName}.\n${personality}`;
  prompt += ESCALATION_INSTRUCTIONS;
  if (knowledgeBase) prompt += `\n\n--- INFORMACIÓN DE LA TIENDA ---\n${knowledgeBase}`;
  if (customerContext) prompt += `\n\n--- PERFIL DEL CLIENTE ---\n${customerContext}`;
  prompt += `\n\nREGLA CRÍTICA SOBRE PEDIDOS: NUNCA inventes, sugieras ni adivines números de pedido alternativos. Si el cliente menciona un número y no tenés información del pedido, decí que no lo encontraste y pedí que confirme el número o te dé el email con el que compró. No sugieras que "quizás es otro número".`;
  if (orderInfo) {
    prompt += `\n\n--- INFORMACIÓN DEL PEDIDO CONSULTADO ---\n${JSON.stringify(orderInfo, null, 2)}`;
    prompt += `\n\nGuía para interpretar el pedido:
- pago "pagado" + envio "enviado" → en camino, compartí el tracking si hay.
- pago "pagado" + envio "en preparación" o "pendiente de preparación" → se está preparando, próximamente se envía.
- pago "pagado" + envio "entregado" → ya fue entregado.
- pago "pendiente de pago" → falta confirmar el pago.
- estado "cancelado" → pedido cancelado, derivar si preguntan por reembolso.
- Si hay tracking, siempre compartilo directamente sin que el cliente lo pida.
- Si hay nota en el pedido, tenerla en cuenta para dar contexto.
- El método de envío puede ser Andreani u otro — no lo inventes si no está en los datos.`;
  }
  if (availableLabels.length) {
    prompt += `\n\n--- ETIQUETAS ---\nDEBÉS etiquetar SIEMPRE esta conversación con al menos 1 etiqueta usando [LABEL:nombre] en tu respuesta (invisible para el cliente).
Etiquetas disponibles: ${availableLabels.join(', ')}.
Si ninguna aplica, creá una nueva con [NEW_LABEL:nombre] (ej: [NEW_LABEL:Mayorista]).
Guía:
- [LABEL:Consulta] → preguntas generales sobre productos, tallas, disponibilidad.
- [LABEL:Pedido] → consulta sobre un pedido específico.
- [LABEL:Reclamo] → queja, problema o insatisfacción.
- [LABEL:Devolución] → cambio, devolución o reembolso.
Podés combinar varias etiquetas si aplica.`;
  }
  return prompt;
}

function buildMessages(conversationHistory, newMessage, imageData = null) {
  const messages = [];
  if (conversationHistory?.length) {
    const recent = conversationHistory.slice(-10);
    for (const msg of recent) {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      messages.push({ role, content: msg.content });
    }
  }
  if (imageData) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageData.mimeType, data: imageData.base64 } },
        { type: 'text', text: newMessage || 'Describí esta imagen en el contexto de la consulta del cliente.' },
      ],
    });
  } else {
    messages.push({ role: 'user', content: newMessage });
  }
  return messages;
}
