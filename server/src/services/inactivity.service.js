import { getDb } from './firebase.service.js';
import admin from 'firebase-admin';
import { sendWhatsAppMessage, sendInstagramMessage } from './meta.service.js';
import { updateConversationStatus } from './conversation.service.js';

const DEFAULT_INACTIVE_HOURS = 24;
const DEFAULT_FAREWELL = 'Hola! Cerramos esta consulta por inactividad. Si necesitás ayuda en el futuro, escribinos cuando quieras 😊';

export async function closeInactiveConversations() {
  const db = getDb();

  const configDoc = await db.collection('config').doc('bot_config').get();
  const botConfig = configDoc.exists ? configDoc.data() : {};
  const inactiveHours = botConfig.inactiveCloseHours ?? DEFAULT_INACTIVE_HOURS;
  const farewellMsg = botConfig.inactiveFarewellMessage ?? DEFAULT_FAREWELL;

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - inactiveHours);
  const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

  const snap = await db.collection('conversations')
    .where('status', '==', 'bot')
    .where('updatedAt', '<=', cutoffTs)
    .get();

  if (snap.empty) return;

  console.log(`[inactivity] Cerrando ${snap.size} conversaciones inactivas (>${inactiveHours}h)`);

  for (const doc of snap.docs) {
    const data = doc.data();
    const contactId = doc.id;

    try {
      if (data.channel === 'whatsapp') {
        await sendWhatsAppMessage(contactId, farewellMsg);
      } else if (data.channel === 'instagram') {
        await sendInstagramMessage(contactId, farewellMsg);
      }

      await updateConversationStatus(contactId, 'resolved');
      console.log(`[inactivity] Cerrada ${contactId} (${data.channel})`);
    } catch (err) {
      console.error(`[inactivity] Error cerrando ${contactId}:`, err.message);
    }
  }
}
