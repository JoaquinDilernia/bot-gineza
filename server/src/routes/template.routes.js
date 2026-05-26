import { Router } from 'express';
import { getAllTemplates, createTemplate, deleteTemplate } from '../services/template.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    res.json(await getAllTemplates());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, displayName, bodyText, language, category, params } = req.body;
  if (!name?.trim() || !bodyText?.trim()) return res.status(400).json({ error: 'name y bodyText requeridos' });
  try {
    res.status(201).json(await createTemplate({ name, displayName: displayName || name, bodyText, language, category, params }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
