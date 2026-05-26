import { Router } from 'express';
import { verifyWebhookSignature, parseWhatsAppMessage, parseInstagramMessage } from '../services/meta.service.js';
import { processIncomingMessage } from '../services/bot.service.js';

const router = Router();

/**
 * GET /api/webhook
 * Verificación inicial del webhook por Meta.
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[webhook] Verificación exitosa');
    return res.status(200).send(challenge);
  }

  console.warn('[webhook] Verificación fallida');
  return res.sendStatus(403);
});

/**
 * POST /api/webhook
 * Recibe mensajes de WhatsApp e Instagram.
 */
router.post('/', async (req, res) => {
  // Verificar firma para seguridad
  const signature = req.headers['x-hub-signature-256'];
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn('[webhook] Firma inválida, request rechazado');
    return res.sendStatus(401);
  }

  // Responder 200 inmediatamente (Meta requiere respuesta rápida)
  res.sendStatus(200);

  try {
    const body = JSON.parse(req.body.toString());
    const object = body.object;

    if (object === 'whatsapp_business_account') {
      const msg = parseWhatsAppMessage(body);
      if (msg) {
        console.log(`[webhook] WPP entrante de ${msg.from}: ${msg.text?.substring(0, 50)}`);
        await processIncomingMessage(msg);
      }
    } else if (object === 'instagram') {
      const msg = parseInstagramMessage(body);
      if (msg) {
        console.log(`[webhook] IG entrante de ${msg.from}: ${msg.text?.substring(0, 50)}`);
        await processIncomingMessage(msg);
      }
    }
  } catch (err) {
    console.error('[webhook] Error procesando mensaje:', err);
  }
});

export default router;
