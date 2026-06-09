import { getDb } from './firebase.service.js';
import admin from 'firebase-admin';

const COLLECTION = 'conversations';

export async function getOrCreateConversation(contactId, channel, contactName = null) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(contactId);
  const doc = await docRef.get();

  if (doc.exists) {
    const data = doc.data();
    if (contactName && !data.contactName) {
      await docRef.update({ contactName });
    }
    return { id: doc.id, ...data };
  }

  const newConversation = {
    contactId,
    channel,
    contactName: contactName ?? null,
    messages: [],
    status: 'bot',
    humanMode: false,
    assignedTo: null,
    unread: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await docRef.set(newConversation);
  return { id: contactId, ...newConversation };
}

export async function appendMessage(contactId, message) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(contactId);

  const doc = await docRef.get();
  const current = doc.exists ? doc.data().messages ?? [] : [];
  const updated = [...current, { ...message, timestamp: new Date() }].slice(-50);

  const extra = {};
  if (message.role === 'user') {
    extra.unread = admin.firestore.FieldValue.increment(1);
  }

  await docRef.update({ messages: updated, updatedAt: new Date(), ...extra });
}

export async function getConversationHistory(contactId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(contactId).get();
  return doc.exists ? doc.data().messages ?? [] : [];
}

export async function updateConversationStatus(contactId, status) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({
    status,
    updatedAt: new Date(),
  });
}

export async function updateHumanMode(contactId, humanMode) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({
    humanMode: !!humanMode,
    updatedAt: new Date(),
  });
}

export async function updateAssignment(contactId, assignedTo) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({
    assignedTo: assignedTo ?? null,
    updatedAt: new Date(),
  });
}

export async function dispatchConversation(contactId, patch) {
  const db = getDb();
  const update = { updatedAt: new Date() };
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.humanMode !== undefined) update.humanMode = !!patch.humanMode;
  if (patch.assignedTo !== undefined) update.assignedTo = patch.assignedTo ?? null;
  await db.collection(COLLECTION).doc(contactId).update(update);
}

export async function addLabelToConversation(contactId, label) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({
    labels: admin.firestore.FieldValue.arrayUnion(label),
    updatedAt: new Date(),
  });
}

export async function removeLabelFromConversation(contactId, label) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({
    labels: admin.firestore.FieldValue.arrayRemove(label),
    updatedAt: new Date(),
  });
}

export async function markAsRead(contactId) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({ unread: 0 });
}

export async function listConversations(filters = {}) {
  const db = getDb();
  const snapshot = await db.collection(COLLECTION).orderBy('updatedAt', 'desc').limit(100).get();

  let docs = snapshot.docs.map((doc) => {
    const data = doc.data();
    const lastMsg = data.messages?.slice(-1)[0];
    return {
      id: doc.id,
      contactId: data.contactId,
      contactName: data.contactName ?? null,
      channel: data.channel,
      status: data.status ?? 'bot',
      humanMode: data.humanMode ?? false,
      assignedTo: data.assignedTo ?? null,
      unread: data.unread ?? 0,
      labels: data.labels ?? [],
      messageCount: data.messages?.length ?? 0,
      lastMessage: lastMsg?.content ?? '',
      lastMessageAt: lastMsg?.timestamp ?? data.updatedAt,
      updatedAt: data.updatedAt,
      createdAt: data.createdAt,
    };
  });

  if (filters.channel) docs = docs.filter(d => d.channel === filters.channel);
  if (filters.status)  docs = docs.filter(d => d.status === filters.status);
  if (filters.assignedTo) docs = docs.filter(d => d.assignedTo === filters.assignedTo);

  return docs;
}
