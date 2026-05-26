import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { getDb } from './firebase.service.js';

const COLLECTION = 'bot-gineza_agents';

function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

export async function seedAgentsIfNeeded() {
  const db = getDb();
  const seeds = [
    { id: 'sofia',   name: 'Sofía',   password: process.env.AGENT_SOFIA_PASSWORD },
    { id: 'joaquin', name: 'Joaquín', password: process.env.AGENT_JOAQUIN_PASSWORD },
  ];
  for (const agent of seeds) {
    if (!agent.password) continue;
    const doc = await db.collection(COLLECTION).doc(agent.id).get();
    if (!doc.exists) {
      await db.collection(COLLECTION).doc(agent.id).set({
        id: agent.id,
        name: agent.name,
        passwordHash: hashPassword(agent.password),
        createdAt: new Date(),
      });
    }
  }
}

export async function validateCredentials(username, password) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(username.toLowerCase()).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.passwordHash !== hashPassword(password)) return null;
  return { id: data.id, name: data.name };
}

export async function updateProfile(agentId, { name, password } = {}) {
  const db = getDb();
  const update = { updatedAt: new Date() };
  if (name) update.name = name;
  if (password) update.passwordHash = hashPassword(password);
  await db.collection(COLLECTION).doc(agentId).update(update);
  const doc = await db.collection(COLLECTION).doc(agentId).get();
  return { id: doc.data().id, name: doc.data().name };
}

export function generateToken(agent) {
  return jwt.sign(
    { id: agent.id, name: agent.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
