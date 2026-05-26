# Contexto: nuevo bot basado en BOT-GINEZA

Este proyecto es un **clon** del bot de Gineza, adaptado para un nuevo cliente.  
El código base ya existe y funciona — solo hay que adaptar branding, credenciales y lógica específica del negocio.

---

## Stack completo

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js (ESM) + Express |
| IA | Anthropic Claude API (claude-sonnet-4-6) |
| Base de datos | Firebase Firestore |
| Mensajería | Meta API (WhatsApp Business + Instagram DM) |
| Frontend dashboard | React + Vite + CSS Modules |
| Auth dashboard | JWT (jsonwebtoken) |
| Deploy | Railway (backend) + Vercel (frontend) |

---

## Arquitectura general

```
/server
  src/
    app.js                    ← Entry point, Express + cron
    routes/
      webhook.routes.js       ← Recibe mensajes de Meta (WhatsApp/Instagram)
      auth.routes.js          ← POST /api/auth/login, GET /api/auth/me
      conversation.routes.js  ← CRUD conversaciones
      knowledge.routes.js     ← Knowledge Base del bot
      label.routes.js         ← Etiquetas
      config.routes.js        ← Configuración del bot (nombre, personalidad, etc.)
      stats.routes.js         ← Estadísticas de uso
      tiendanube.routes.js    ← Integración Tienda Nube (pedidos)
      customer.routes.js      ← Perfil de clientes
    services/
      bot.service.js          ← Orquesta el flujo de cada mensaje entrante
      claude.service.js       ← Llama a la API de Anthropic, construye system prompt
      conversation.service.js ← CRUD Firestore de conversaciones
      firebase.service.js     ← Init y getDb()
      meta.service.js         ← sendWhatsAppMessage / sendInstagramMessage
      knowledge.service.js    ← Lee KB de Firestore y la formatea para el prompt
      label.service.js        ← CRUD etiquetas
      auth.service.js         ← validateCredentials, generateToken, verifyToken
      inactivity.service.js   ← Cierra conversaciones inactivas >24h (cron hourly)
      tiendanube.service.js   ← findOrder, formatOrderStatus
      customer.service.js     ← Perfil cliente enriquecido con Tienda Nube
    middleware/
      requireAuth.js          ← Verifica JWT en header Authorization: Bearer <token>

/client
  src/
    App.jsx                   ← Router principal (rutas protegidas con AuthContext)
    contexts/AuthContext.jsx  ← agent, token, login(), logout(), updateAgent()
    lib/api.js                ← authFetch() — agrega Authorization header automático
    pages/
      Login.jsx               ← Pantalla de login (usuario/contraseña)
      Dashboard.jsx           ← Resumen de estado actual
      Conversations.jsx       ← Inbox de conversaciones con thread y labels
      Stats.jsx               ← Estadísticas (KPIs, gráficos CSS, tendencia diaria)
      KnowledgeBase.jsx       ← CRUD de la base de conocimiento del bot
      Config.jsx              ← Nombre del bot, personalidad, mensaje de bienvenida
      Labels.jsx              ← CRUD etiquetas de color
      Simulator.jsx           ← Simular conversación con el bot
      Profile.jsx             ← Perfil del agente logueado
    components/Layout/        ← Sidebar con nav + logout
```

---

## Flujo de un mensaje entrante

1. Meta llama `POST /api/webhook` con el mensaje
2. `webhook.routes.js` extrae `{ channel, from, messageId, text, contactName }` y llama `processIncomingMessage()`
3. `bot.service.js`:
   - Busca o crea conversación en Firestore
   - Si `humanMode === true` → silencia el bot (agente humano está atendiendo)
   - Llama `generateBotResponse()` con historial + KB + contexto de cliente + pedido
   - Parsea marcadores en la respuesta:
     - `[ESCALAR_SOFIA]` / `[ESCALAR_JOAQUIN]` / `[ESCALAR]` → escala, activa humanMode
     - `[CERRAR]` → cierra la conversación (`status: 'resolved'`)
     - `[LABEL:nombre]` → etiqueta automática
   - Envía respuesta limpia (sin marcadores) al cliente por WhatsApp o Instagram

---

## Marcadores especiales del bot

El system prompt le enseña al bot a usar estos prefijos:

| Marcador | Efecto |
|---------|--------|
| `[ESCALAR_SOFIA]` | Escala a Sofía (envíos, cambios, devoluciones) |
| `[ESCALAR_JOAQUIN]` | Escala a Joaquín (pagos, facturación, reembolsos) |
| `[ESCALAR]` | Escala sin asignar (urgencia genérica) |
| `[CERRAR]` | Cierra la conversación como resuelta |
| `[LABEL:nombre]` | Aplica etiqueta (ej: `[LABEL:Reclamo]`) |

---

## Variables de entorno (server/.env)

```env
# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Meta
META_VERIFY_TOKEN=         # token de verificación del webhook Meta
WHATSAPP_TOKEN=            # token de acceso de la app Meta
WHATSAPP_PHONE_NUMBER_ID=  # ID del número de teléfono de WhatsApp
INSTAGRAM_PAGE_ID=         # ID de la página de Instagram
INSTAGRAM_TOKEN=           # token de acceso de Instagram

# Auth dashboard
JWT_SECRET=
AGENT_SOFIA_PASSWORD=
AGENT_JOAQUIN_PASSWORD=

# Tienda Nube (opcional)
TIENDANUBE_STORE_ID=
TIENDANUBE_ACCESS_TOKEN=
```

---

## Firestore: colecciones principales

| Colección | Documento / estructura |
|-----------|----------------------|
| `conversations` | doc ID = contactId (phone/ig). Campos: status, humanMode, assignedTo, channel, messages[], labels[], createdAt, updatedAt |
| `knowledge_base` | items de KB: { category, content, active, order } |
| `labels` | { name, color, createdAt } |
| `config` | doc `bot_config`: { botName, botPersonality, welcomeMessage, inactiveCloseHours, inactiveFarewellMessage } |
| `agents` | { id, name, passwordHash } (seeded al arrancar) |

---

## Dashboard: agentes

Hay dos agentes hardcodeados (Sofia y Joaquin). Las credenciales vienen del `.env`.  
El `seedAgentsIfNeeded()` los crea en Firestore si no existen.  
El JWT dura 7 días.

---

## Cron de inactividad

Corre cada hora. Cierra conversaciones con `status === 'bot'` y `updatedAt < now - 24h` (configurable desde `config/bot_config`).  
Solo cierra las que maneja el bot — **no toca las escaladas a agentes humanos**.  
Manda un mensaje de despedida antes de cerrar.

---

## Qué cambiar para un nuevo cliente

### Obligatorio
- [ ] Todas las variables del `.env` (nuevas credenciales de Firebase, Meta, Anthropic)
- [ ] Nombre del bot (`botName` en Firestore o `.env`)
- [ ] Personalidad del bot (`botPersonality` en Firestore)
- [ ] Nombres de agentes en `auth.service.js` (AGENTS object: ids, names, password env vars)
- [ ] Variables de env de passwords: `AGENT_[NOMBRE]_PASSWORD`
- [ ] `claude.service.js` → ESCALATION_INSTRUCTIONS: cambiar a quién escala qué tema
- [ ] KB inicial en Firestore (info del negocio, productos, políticas)
- [ ] Colores/branding del dashboard: `client/src/index.css` (variables CSS `--color-*`)
- [ ] Nombre del proyecto en `package.json` y en el Layout sidebar (`brandName`)

### Opcional según cliente
- [ ] Integración Tienda Nube (si no tiene TN, deshabilitar `tiendanube.service.js`)
- [ ] Canales activos (si solo WhatsApp, ignorar lógica Instagram y viceversa)
- [ ] Horas de inactividad para cierre automático
- [ ] Colores de etiquetas predeterminados
- [ ] Umbrales de urgencia en `bot.service.js` (`URGENCY_KEYWORDS`)

---

## Cómo correr localmente

```bash
# Backend
cd server && npm install && npm run dev   # puerto 3001

# Frontend
cd client && npm install && npm run dev   # puerto 5173
```

El frontend hace proxy al backend vía `vite.config.js` (ya configurado).

---

## Estado actual del proyecto original (BOT-GINEZA)

Features completas:
- ✅ Webhook Meta (WhatsApp + Instagram)
- ✅ Bot con IA (Claude), KB dinámica, historial de conversación
- ✅ Escalada a agentes (Sofia/Joaquin) con humanMode
- ✅ Cierre automático `[CERRAR]` + cron de inactividad
- ✅ Etiquetas manuales y automáticas
- ✅ Dashboard completo (inbox, KB, config, stats, simulator, labels, profile)
- ✅ Auth con JWT
- ✅ Integración Tienda Nube (pedidos)
- ✅ Perfil de clientes enriquecido
- ✅ Estadísticas (KPIs, gráficos CSS, por agente/estado/canal)

Pendiente en BOT-GINEZA (no bloquea el clon):
- ⏳ Deploy a Railway/Vercel
- ⏳ Conectar webhook Meta en producción
