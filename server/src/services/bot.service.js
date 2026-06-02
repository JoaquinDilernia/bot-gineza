import { generateBotResponse } from './claude.service.js';
import { getKnowledgeBasePrompt } from './knowledge.service.js';
import {
  getOrCreateConversation,
  appendMessage,
  getConversationHistory,
  updateConversationStatus,
  updateHumanMode,
  updateAssignment,
  addLabelToConversation,
} from './conversation.service.js';
import { findOrder, findOrdersByEmail, formatOrderStatus } from './tiendanube.service.js';
import { sendWhatsAppMessage, sendInstagramMessage, markWhatsAppAsRead, downloadMediaAsBase64 } from './meta.service.js';
import {
  getOrCreateCustomer,
  enrichCustomerFromTiendaNube,
  buildCustomerContext,
  linkCustomerFromOrder,
} from './customer.service.js';
import { getAllLabels, createLabel } from './label.service.js';
import { getDb } from './firebase.service.js';

const ORDER_PATTERNS = [
  /pedido\s*#?\s*(\d{4,})/i,
  /orden\s*#?\s*(\d{4,})/i,
  /compra\s*#?\s*(\d{4,})/i,
  /número\s*#?\s*(\d{4,})/i,
  /^(\d{4,})$/,
  /tracking/i,
  /donde\s*(está|esta)\s*(mi|el)\s*pedido/i,
  /estado\s*(de|del)\s*(mi|el)?\s*pedido/i,
  /cuándo\s*(llega|llega)/i,
];

const URGENCY_KEYWORDS = [
  /urgente/i, /urgencia/i, /devolución/i, /devolucion/i, /reembolso/i,
  /reclamo/i, /estafa/i, /fraude/i, /nunca llegó/i, /nunca llego/i,
  /muy enojad/i, /indignado/i, /hablar con una persona/i, /quiero hablar/i,
];

// Detecta el marcador de escalada y retorna { shouldEscalate, assignTo, cleanText }
// Si el marcador está solo en su línea → borra la línea (nota interna no llega al cliente).
// Si el marcador está al inicio de la única línea con texto (formato viejo) → solo borra el token.
function parseEscalationMarker(text) {
  const MARKERS = [
    { re: /\[ESCALAR_JOAQUIN\]/, assignTo: 'joaquin' },
    { re: /\[ESCALAR_SOFIA\]/,   assignTo: 'sofia' },
    { re: /\[ESCALAR\]/,         assignTo: null },
  ];
  for (const { re, assignTo } of MARKERS) {
    if (!re.test(text)) continue;
    // Eliminar la línea entera que contiene el marcador (borra notas internas)
    const withoutLine = text.replace(/^[^\n]*\[ESCALAR(?:_JOAQUIN|_SOFIA)?\][^\n]*\n?/m, '').trim();
    // Si queda texto → usarlo; si quedó vacío (marcador era toda la respuesta) → solo quitar el token
    const cleanText = withoutLine || text.replace(re, '').trim();
    return { shouldEscalate: true, assignTo, cleanText };
  }
  return { shouldEscalate: false, assignTo: null, cleanText: text };
}

function parseCloseMarker(text) {
  if (text.startsWith('[CERRAR]')) {
    return { shouldClose: true, cleanText: text.replace(/^\[CERRAR\]\s*/, '') };
  }
  return { shouldClose: false, cleanText: text };
}

function parseLabelMarkers(text) {
  const labels = [...text.matchAll(/\[LABEL:([^\]]+)\]/g)].map(m => m[1].trim());
  const newLabels = [...text.matchAll(/\[NEW_LABEL:([^\]]+)\]/g)].map(m => m[1].trim());
  const cleanText = text.replace(/\[(NEW_)?LABEL:[^\]]+\]/g, '').trim();
  return { labels, newLabels, cleanText };
}

export async function processIncomingMessage(msg) {
  const { channel, from, messageId, text, type, mediaId, mediaUrl, contactName } = msg;

  if (channel === 'whatsapp' && messageId) {
    markWhatsAppAsRead(messageId).catch(() => {});
  }

  let conversation, history, knowledgeBase, customer, availableLabels, configDoc;
  try {
    [conversation, history, knowledgeBase, customer, availableLabels, configDoc] = await Promise.all([
      getOrCreateConversation(from, channel, contactName),
      getConversationHistory(from),
      getKnowledgeBasePrompt().catch(() => ''),
      getOrCreateCustomer(from, channel, contactName),
      getAllLabels().catch(() => []),
      getDb().collection('config').doc('bot_config').get().catch(() => ({ exists: false, data: () => ({}) })),
    ]);
  } catch (err) {
    console.error('[bot] Error cargando contexto para', from, err.message);
    return;
  }
  const botConfig = configDoc.exists ? configDoc.data() : {};
  console.log(`[bot] Contexto cargado para ${from} — humanMode: ${conversation.humanMode}`);


  if (conversation.humanMode) {
    if (text?.trim()) await appendMessage(from, { role: 'user', content: text, contactName });
    console.log(`[bot] humanMode activo para ${from} — bot silenciado`);
    return;
  }

  // --- Manejo de tipos no-texto ---
  if (type === 'audio') {
    const prevAudios = history.filter(m => m.role === 'user' && m.mediaType === 'audio').length;
    const audioUserMsg = '[Audio recibido]';
    await appendMessage(from, { role: 'user', content: audioUserMsg, mediaType: 'audio', contactName });

    let reply;
    if (prevAudios >= 1) {
      reply = 'Entiendo que preferís los audios — lamentablemente no puedo escucharlos. ¿Querés que te pase con un agente que pueda ayudarte mejor?';
      await updateConversationStatus(from, 'urgent');
    } else {
      reply = 'Hola! Recibí tu audio pero no puedo escucharlo 🎙️ ¿Podés contarme por escrito en qué te ayudo?';
    }
    await appendMessage(from, { role: 'assistant', content: reply });
    if (channel === 'whatsapp') await sendWhatsAppMessage(from, reply);
    else if (channel === 'instagram') await sendInstagramMessage(from, reply);
    return;
  }

  if (type === 'video' || type === 'sticker') {
    if (!text?.trim()) return;
  }

  if (type === 'document') {
    const reply = 'Recibí un archivo, pero no puedo procesarlo directamente. ¿Podés contarme por escrito en qué te ayudo?';
    await appendMessage(from, { role: 'user', content: '[Archivo recibido]', contactName });
    await appendMessage(from, { role: 'assistant', content: reply });
    if (channel === 'whatsapp') await sendWhatsAppMessage(from, reply);
    else if (channel === 'instagram') await sendInstagramMessage(from, reply);
    return;
  }

  // --- Imagen: descargar y pasar a Claude ---
  let imageData = null;
  if (type === 'image') {
    if (mediaId) {
      imageData = await downloadMediaAsBase64(mediaId).catch(() => null);
    } else if (mediaUrl) {
      // Instagram da URL directa
      try {
        const axios = (await import('axios')).default;
        const { data: buffer } = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        imageData = { base64: Buffer.from(buffer).toString('base64'), mimeType: 'image/jpeg' };
      } catch { /* continue without image */ }
    }
    const userContent = text?.trim() ? `[Imagen] ${text}` : '[Imagen recibida]';
    await appendMessage(from, { role: 'user', content: userContent, mediaType: 'image', contactName });
  } else {
    if (!text?.trim()) return;
    await appendMessage(from, { role: 'user', content: text, contactName });
  }

  const isUrgent = text && URGENCY_KEYWORDS.some(re => re.test(text));
  if (isUrgent && conversation.status === 'bot') {
    updateConversationStatus(from, 'urgent').catch(() => {});
  }

  const orderInfo = await resolveOrderContext(text ?? '');
  const customerContext = buildCustomerContext(customer);

  if (orderInfo.tnCustomer) {
    linkCustomerFromOrder(from, orderInfo.tnCustomer).catch(err =>
      console.error('[bot] linkCustomer error:', err.message)
    );
  }

  console.log(`[bot] Llamando a Claude para ${from}`);
  const botReply = await generateBotResponse(text ?? '', history, {
    knowledgeBase,
    orderInfo: orderInfo.orderInfo,
    customerContext,
    availableLabels: availableLabels.map(l => l.name),
    botConfig,
    imageData,
  });
  console.log(`[bot] Claude respondió (${botReply.length} chars) para ${from}`);

  const { shouldEscalate, assignTo, cleanText: textAfterEscalation } = parseEscalationMarker(botReply);
  const { shouldClose, cleanText: textAfterClose } = parseCloseMarker(textAfterEscalation);
  const { labels: botLabels, newLabels: botNewLabels, cleanText } = parseLabelMarkers(textAfterClose);

  await appendMessage(from, { role: 'assistant', content: cleanText });

  if (botNewLabels.length > 0) {
    await Promise.all(botNewLabels.map(l => createLabel(l, '#6b7280').then(() => addLabelToConversation(from, l))));
    console.log(`[bot] Nuevas labels creadas y aplicadas a ${from}:`, botNewLabels);
  }
  if (botLabels.length > 0) {
    await Promise.all(botLabels.map(l => addLabelToConversation(from, l)));
    console.log(`[bot] Labels aplicadas a ${from}:`, botLabels);
  }

  if (shouldEscalate) {
    const updates = [
      updateConversationStatus(from, 'escalated'),
      updateHumanMode(from, true),
    ];
    if (assignTo) updates.push(updateAssignment(from, assignTo));
    await Promise.all(updates);
    console.log(`[bot] Escalando ${from} → agente: ${assignTo ?? 'sin asignar'}`);
  } else if (shouldClose) {
    await updateConversationStatus(from, 'resolved');
    console.log(`[bot] Conversación ${from} cerrada por el bot`);
  }

  if (channel === 'whatsapp') {
    if (!cleanText.trim()) {
      console.warn(`[bot] cleanText vacío para ${from} — no se envía a WPP`);
      return;
    }
    try {
      console.log(`[bot] Enviando WPP a ${from}: ${cleanText.substring(0, 60)}`);
      await sendWhatsAppMessage(from, cleanText);
      console.log(`[bot] WPP enviado OK a ${from}`);
    } catch (sendErr) {
      console.error(`[bot] ERROR enviando WPP a ${from}:`, sendErr.response?.data ?? sendErr.message);
    }
  } else if (channel === 'instagram') {
    if (!cleanText.trim()) return;
    try {
      await sendInstagramMessage(from, cleanText);
    } catch (sendErr) {
      console.error(`[bot] ERROR enviando IG a ${from}:`, sendErr.response?.data ?? sendErr.message);
    }
  }
}

async function resolveOrderContext(text) {
  const trimmed = text.trim();

  // Búsqueda por email
  if (trimmed.includes('@')) {
    const orders = await findOrdersByEmail(trimmed);
    if (orders.length) {
      const summary = orders.map(o => formatOrderStatus(o)).filter(Boolean);
      return { orderInfo: summary, tnCustomer: orders[0]?.customer ?? null };
    }
    return { orderInfo: null, tnCustomer: null };
  }

  for (const pattern of ORDER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const orderNumber = match[1] ?? null;
      if (orderNumber) {
        const order = await findOrder(orderNumber);
        return {
          orderInfo: order ? formatOrderStatus(order) : null,
          tnCustomer: order?.customer ?? null,
        };
      }
      return { orderInfo: null, tnCustomer: null };
    }
  }
  return { orderInfo: null, tnCustomer: null };
}
