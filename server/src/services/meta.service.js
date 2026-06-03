import axios from 'axios';
import crypto from 'crypto';

const META_API_URL = 'https://graph.facebook.com/v20.0';

/**
 * Verifica la firma del webhook de Meta.
 * @param {Buffer} rawBody
 * @param {string} signature - Header x-hub-signature-256
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !process.env.META_APP_SECRET) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', process.env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex')}`;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Envía un mensaje de texto por WhatsApp.
 * @param {string} to - Número de teléfono del destinatario
 * @param {string} text - Texto del mensaje
 * @returns {Promise<void>}
 */
export async function sendWhatsAppMessage(to, text) {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PHONE_NUMBER_ID) {
    console.log('[meta] sendWhatsAppMessage skipped — tokens not configured');
    return;
  }
  await axios.post(
    `${META_API_URL}/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Envía un mensaje de texto por Instagram DM.
 * @param {string} recipientId - PSID del usuario en Instagram
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function sendInstagramMessage(recipientId, text) {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_IG_PAGE_ID) {
    console.log('[meta] sendInstagramMessage skipped — tokens not configured');
    return;
  }
  await axios.post(
    `${META_API_URL}/${process.env.META_IG_PAGE_ID}/messages`,
    {
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Marca un mensaje de WhatsApp como leído.
 * @param {string} messageId
 * @returns {Promise<void>}
 */
export async function markWhatsAppAsRead(messageId) {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PHONE_NUMBER_ID) return;
  await axios.post(
    `${META_API_URL}/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Descarga un media de Meta y retorna base64 + mimeType.
 * @param {string} mediaId
 * @returns {Promise<{base64: string, mimeType: string}|null>}
 */
export async function downloadMediaAsBase64(mediaId) {
  if (!process.env.META_ACCESS_TOKEN) return null;
  try {
    const { data: info } = await axios.get(`${META_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
    });
    const { data: buffer } = await axios.get(info.url, {
      headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
      responseType: 'arraybuffer',
    });
    return {
      base64: Buffer.from(buffer).toString('base64'),
      mimeType: info.mime_type ?? 'image/jpeg',
    };
  } catch (err) {
    console.error('[meta] Error descargando media:', err.message);
    return null;
  }
}


/**
 * Envía un mensaje de plantilla de WhatsApp.
 * @param {string} to
 * @param {string} templateName - Nombre técnico de la plantilla en Meta
 * @param {string} language - Código de idioma (ej: 'es_AR', 'en_US')
 * @param {string[]} params - Valores para los parámetros {{1}}, {{2}}, ...
 */
export async function sendWhatsAppTemplate(to, templateName, language = 'es_AR', params = []) {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PHONE_NUMBER_ID) {
    console.log('[meta] sendWhatsAppTemplate skipped — tokens not configured');
    return;
  }
  const template = {
    name: templateName,
    language: { code: language },
  };
  if (params.length > 0) {
    template.components = [
      {
        type: 'body',
        parameters: params.map(p => ({ type: 'text', text: p })),
      },
    ];
  }
  await axios.post(
    `${META_API_URL}/${process.env.META_PHONE_NUMBER_ID}/messages`,
    { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template },
    { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
  );
}

export async function fetchMetaTemplateStatuses() {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID) return [];
  try {
    const { data } = await axios.get(
      `${META_API_URL}/${process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
      {
        headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
        params: { fields: 'name,status,language', limit: 100 },
      }
    );
    return data.data ?? [];
  } catch (err) {
    console.error('[meta] fetchMetaTemplateStatuses error:', err.response?.data ?? err.message);
    return [];
  }
}

export function parseWhatsAppMessage(webhookBody) {
  try {
    const entry = webhookBody.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.[0]) return null;

    const msg = value.messages[0];
    const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'];
    const mediaId = MEDIA_TYPES.includes(msg.type) ? msg[msg.type]?.id : null;
    const caption = MEDIA_TYPES.includes(msg.type) ? (msg[msg.type]?.caption ?? '') : '';

    return {
      channel: 'whatsapp',
      from: msg.from,
      messageId: msg.id,
      text: msg.text?.body ?? caption,
      type: msg.type,
      mediaId,
      timestamp: msg.timestamp,
      contactName: value.contacts?.[0]?.profile?.name ?? 'Cliente',
    };
  } catch {
    return null;
  }
}

/**
 * Extrae datos de un mensaje entrante de Instagram.
 * @param {object} webhookBody
 * @returns {object|null}
 */
export function parseInstagramMessage(webhookBody) {
  try {
    const entry = webhookBody.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging?.message) return null;

    const attachments = messaging.message.attachments ?? [];
    const imageAttachment = attachments.find(a => a.type === 'image');

    return {
      channel: 'instagram',
      from: messaging.sender.id,
      messageId: messaging.message.mid,
      text: messaging.message.text ?? '',
      type: imageAttachment ? 'image' : (attachments.length ? attachments[0].type : 'text'),
      mediaUrl: imageAttachment?.payload?.url ?? null,
      timestamp: messaging.timestamp,
      contactName: 'Cliente',
    };
  } catch {
    return null;
  }
}
