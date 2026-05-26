import { Router } from 'express';
import { validateCredentials, generateToken, updateProfile } from '../services/auth.service.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const agent = await validateCredentials(username, password);
    if (!agent) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const token = generateToken(agent);
    res.json({ token, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ agent: req.agent });
});

router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    if (newPassword) {
      const valid = await validateCredentials(req.agent.id, currentPassword);
      if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    }
    const updated = await updateProfile(req.agent.id, {
      name: name?.trim() || undefined,
      password: newPassword || undefined,
    });
    const token = generateToken(updated);
    res.json({ agent: updated, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
