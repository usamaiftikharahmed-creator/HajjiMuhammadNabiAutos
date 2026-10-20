// Helper utilities for persisting Read/Unread notification status

const STORAGE_KEY = 'admin_read_notifications_v1';

export const getReadNotificationIds = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const setReadNotificationIds = (ids) => {
  try {
    const safeIds = Array.isArray(ids) ? ids : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeIds));
    window.dispatchEvent(new CustomEvent('notifications_read_updated', { detail: safeIds }));
  } catch (e) {
    console.error('Failed to save read notifications:', e);
  }
};

export const markNotificationRead = (notifId) => {
  if (!notifId) return;
  const current = getReadNotificationIds();
  if (!current.includes(notifId)) {
    setReadNotificationIds([...current, notifId]);
  }
};

export const markNotificationUnread = (notifId) => {
  if (!notifId) return;
  const current = getReadNotificationIds();
  setReadNotificationIds(current.filter(id => id !== notifId));
};

export const markAllNotificationsRead = (notifIds = []) => {
  const current = getReadNotificationIds();
  const safeNotifIds = Array.isArray(notifIds) ? notifIds : [];
  const combined = new Set([...current, ...safeNotifIds]);
  setReadNotificationIds(Array.from(combined));
};

export const markAllNotificationsUnread = (notifIds = []) => {
  const current = getReadNotificationIds();
  const safeNotifIds = Array.isArray(notifIds) ? notifIds : [];
  const removeSet = new Set(safeNotifIds);
  setReadNotificationIds(current.filter(id => !removeSet.has(id)));
};

export const generateNotificationId = (item, type = 'promise') => {
  if (!item) return '';
  const itemId = item._id || item.id || 'notif';
  if (type === 'promise') {
    let pDate = 'today';
    if (item.promiseDate) {
      try {
        const d = new Date(item.promiseDate);
        if (!isNaN(d.getTime())) {
          pDate = d.toISOString().split('T')[0];
        }
      } catch (e) {
        pDate = 'today';
      }
    }
    return `promise_${itemId}_${pDate}`;
  } else {
    let today = 'today';
    try {
      today = new Date().toISOString().split('T')[0];
    } catch (e) {
      today = 'today';
    }
    return `due_${itemId}_${today}`;
  }
};
