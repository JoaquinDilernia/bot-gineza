import { Router } from 'express';
import {
  listConversations,
  getConversationHistory,
  updateConversationStatus,
  updateHumanMode,
  updateAssignment,
  markAsRead,
  appendMessage,
  getOrCreateConversation,
} from '../services/conversation.service.js';
import { sendWhatsAppMessage, sendInstagramMessage, sendWhatsAppTemplate } from '../services/meta.service.js';
import { getDb } from '../services/firebase.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { channel, status, assignedTo } = req.query;
    const conversations = await listConversations({ channel, status, assignedTo });
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:contactId/messages', async (req, res) => {
  try {
    const messages = await getConversationHistory(req.params.contactId);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:contactId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['bot', 'urgent', 'waiting', 'escalated', 'resolved'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Valores permitidos: ${valid.join(', ')}` });
    }
    await updateConversationStatus(req.params.contactId, status);
    if (status === 'resolved') {
      await updateHumanMode(req.params.contactId, false);
    }
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:contactId/mode', async (req, res) => {
  try {
    const { humanMode } = req.body;
    await updateHumanMode(req.params.contactId, humanMode);
    res.json({ ok: true, humanMode: !!humanMode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:contactId/assign', async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const valid = ['sofia', 'joaquin', null];
    if (!valid.includes(assignedTo)) {
      return res.status(400).json({ error: 'assignedTo debe ser "sofia", "joaquin" o null' });
    }
    await updateAssignment(req.params.contactId, assignedTo);
    res.json({ ok: true, assignedTo: assignedTo ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:contactId/read', async (req, res) => {
  try {
    await markAsRead(req.params.contactId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:contactId/reply', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }

    const db = getDb();
    const doc = await db.collection('conversations').doc(contactId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Conversación no encontrada' });

    const { channel } = doc.data();

    await appendMessage(contactId, { role: 'admin', content: message.trim() });

    let sendError = null;
    try {
      if (channel === 'whatsapp') {
        await sendWhatsAppMessage(contactId, message.trim());
      } else if (channel === 'instagram') {
        await sendInstagramMessage(contactId, message.trim());
      }
    } catch (sendErr) {
      const detail = sendErr.response?.data ?? sendErr.message;
      console.error('[reply] Error enviando por canal:', JSON.stringify(detail));
      sendError = typeof detail === 'object' ? JSON.stringify(detail) : detail;
    }

    if (sendError) {
      return res.status(502).json({ error: `Guardado en panel pero falló el envío: ${sendError}` });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const { phone, contactName, templateName, language, params = [] } = req.body;
    if (!phone?.trim() || !templateName?.trim()) {
      return res.status(400).json({ error: 'phone y templateName requeridos' });
    }
    const normalizedPhone = phone.trim().replace(/[^\d]/g, '');
    const conv = await getOrCreateConversation(normalizedPhone, 'whatsapp', contactName?.trim() || null);
    await sendWhatsAppTemplate(normalizedPhone, templateName, language || 'es_AR', params);
    const templateText = params.length > 0
      ? `[Plantilla: ${templateName}] ${params.join(' | ')}`
      : `[Plantilla: ${templateName}]`;
    await appendMessage(normalizedPhone, { role: 'admin', content: templateText });
    res.status(201).json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
