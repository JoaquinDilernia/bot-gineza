# BOT-GINEZA

Bot conversacional para **Gineza** — e-commerce de indumentaria femenina.  
Integra WhatsApp Business, Instagram, Tienda Nube y Claude AI para brindar atención personalizada y automatizada.

---

## Stack

- **Frontend**: React + Vite + CSS puro
- **Backend**: Node.js + Express
- **Database**: Firebase Firestore + Firebase Auth
- **AI**: Claude API (Anthropic) con prompt caching
- **Mensajería**: Meta Cloud API (WhatsApp + Instagram)
- **E-commerce**: Tienda Nube API

---

## Estructura

```
BOT-GINEZA/
├── client/           # Dashboard admin (React)
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── services/
│       └── styles/
├── server/           # API + Webhook handler (Node/Express)
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── middlewares/
│       └── utils/
└── README.md
```

---

## Setup

### 1. Clonar y configurar variables de entorno

```bash
# Server
cd server
cp .env.example .env
npm install

# Client
cd ../client
cp .env.example .env
npm install
```

### 2. Variables requeridas en `server/.env`

```
# Meta (WhatsApp + Instagram)
META_VERIFY_TOKEN=
META_APP_SECRET=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_IG_PAGE_ID=

# Tienda Nube
TIENDANUBE_ACCESS_TOKEN=
TIENDANUBE_STORE_ID=

# Anthropic
ANTHROPIC_API_KEY=

# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# App
PORT=3001
NODE_ENV=development
```

### 3. Levantar en desarrollo

```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

### 4. Configurar webhook en Meta

URL del webhook: `https://tu-dominio.com/api/webhook`  
Token de verificación: el valor de `META_VERIFY_TOKEN`

---

## Funcionalidades del bot

- Respuestas conversacionales humanizadas vía Claude AI
- Consulta de estado de pedidos en tiempo real (Tienda Nube)
- Base de conocimiento editable desde el dashboard
- Soporte simultáneo WhatsApp e Instagram (mismo webhook)
- Historial de conversaciones

---

## Dashboard Admin

- **Knowledge Base**: Gestión de FAQs y contenido del bot
- **Conversaciones**: Monitor en tiempo real
- **Configuración**: Tono, horarios, mensajes de bienvenida
- **Analytics**: Métricas de interacción
