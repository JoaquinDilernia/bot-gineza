import { getDb } from './firebase.service.js';
import { fetchMetaTemplateStatuses } from './meta.service.js';

const COLLECTION = 'whatsapp_templates';

export async function getAllTemplates() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('displayName').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createTemplate({ name, displayName, bodyText, language, category, params }) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).add({
    name: name.trim(),
    displayName: displayName.trim(),
    bodyText: bodyText.trim(),
    language: language?.trim() || 'es_AR',
    category: category || 'UTILITY',
    params: Array.isArray(params) ? params : [],
    metaStatus: 'PENDING',
    createdAt: new Date(),
  });
  const snap = await doc.get();
  return { id: snap.id, ...snap.data() };
}

export async function syncTemplateStatuses() {
  const metaTemplates = await fetchMetaTemplateStatuses();
  if (metaTemplates.length === 0) return;
  const db = getDb();
  const snap = await db.collection(COLLECTION).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) {
    const { name, language } = doc.data();
    const metaMatch = metaTemplates.find(t => t.name === name && t.language === language);
    if (metaMatch) {
      batch.update(doc.ref, { metaStatus: metaMatch.status });
    }
  }
  await batch.commit();
}

export async function deleteTemplate(id) {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).delete();
}
