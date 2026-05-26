import { useEffect, useRef } from 'react';

const APP_TITLE = 'Gineza';

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* audio not available */ }
}

export function useNotifications(conversations) {
  const prevRef = useRef(null);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0);
    document.title = totalUnread > 0 ? `(${totalUnread}) ${APP_TITLE}` : APP_TITLE;
  }, [conversations]);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = conversations;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = conversations;

    if (document.visibilityState === 'visible') return;

    conversations.forEach(conv => {
      if (!conv.humanMode) return;
      const old = prev.find(c => c.id === conv.id);
      if (!old) return;
      const newUnread = conv.unread ?? 0;
      const oldUnread = old.unread ?? 0;
      if (newUnread > oldUnread) {
        playBeep();
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(conv.contactName || 'Nuevo mensaje', {
            body: conv.lastMessage || 'Nuevo mensaje recibido',
            icon: '/favicon.ico',
            tag: `gineza-${conv.id}`,
          });
        }
      }
    });
  }, [conversations]);
}
