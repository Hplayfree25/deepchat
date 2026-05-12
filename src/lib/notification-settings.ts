'use client';

export type NotificationEventKey =
  | 'responseFinished'
  | 'task'
  | 'usage'
  | 'agent';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationEventSetting {
  enabled: boolean;
  inApp: boolean;
  push: boolean;
  sound: boolean;
}

export interface QuietHoursSettings {
  enabled: boolean;
  start: string;
  end: string;
  allowErrors: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  soundEnabled: boolean;
  onlyPushWhenAway: boolean;
  groupByChat: boolean;
  maxInboxItems: number;
  quietHours: QuietHoursSettings;
  events: Record<NotificationEventKey, NotificationEventSetting>;
}

export interface NotificationDelivery {
  inApp: boolean;
  push: boolean;
  sound: boolean;
}

export interface DeepChatNotificationDetail {
  id: string;
  type: NotificationEventKey;
  title: string;
  description: string;
  severity: NotificationSeverity;
  time: string;
  createdAt: string;
  unread: boolean;
  chatId?: string;
  href?: string;
  delivery: NotificationDelivery;
}

export type StoredNotification = Omit<DeepChatNotificationDetail, 'delivery'>;

const SETTINGS_KEY = 'deepchat-notification-settings';
const INBOX_KEY = 'deepchat-notification-inbox';
const SETTINGS_EVENT = 'deepchat:notification-settings-updated';
const INBOX_EVENT = 'deepchat:notification-inbox-updated';

const baseEventSetting: NotificationEventSetting = {
  enabled: true,
  inApp: true,
  push: false,
  sound: false
};

export const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  inAppEnabled: true,
  pushEnabled: false,
  soundEnabled: false,
  onlyPushWhenAway: true,
  groupByChat: true,
  maxInboxItems: 50,
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
    allowErrors: true
  },
  events: {
    responseFinished: { ...baseEventSetting, push: true },
    task: { ...baseEventSetting, push: true, sound: true },
    usage: { ...baseEventSetting, push: true, sound: true },
    agent: { ...baseEventSetting, push: false }
  }
};

const eventLabels: Record<NotificationEventKey, { title: string; description: string }> = {
  responseFinished: {
    title: 'Response finished',
    description: 'Notify when a background AI response is ready to read.'
  },
  task: {
    title: 'Task',
    description: 'Notify about background task completion, failure, cancellation, and workflow status.'
  },
  usage: {
    title: 'Usage',
    description: 'Notify when usage reaches important thresholds, including the 1M token milestone.'
  },
  agent: {
    title: 'Agent',
    description: 'Notify when an agent needs attention, selection, approval, or a decision.'
  }
};

export const notificationEventLabels = eventLabels;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

const normalizeEventSetting = (setting: unknown, fallback: NotificationEventSetting): NotificationEventSetting => {
  if (!isRecord(setting)) return fallback;
  return {
    enabled: typeof setting.enabled === 'boolean' ? setting.enabled : fallback.enabled,
    inApp: typeof setting.inApp === 'boolean' ? setting.inApp : fallback.inApp,
    push: typeof setting.push === 'boolean' ? setting.push : fallback.push,
    sound: typeof setting.sound === 'boolean' ? setting.sound : fallback.sound
  };
};

const normalizeSettings = (settings: unknown): NotificationSettings => {
  if (!isRecord(settings)) return defaultNotificationSettings;
  const quietHours = isRecord(settings.quietHours) ? settings.quietHours : {};
  const events = isRecord(settings.events) ? settings.events : {};
  const normalizedEvents = Object.fromEntries(
    (Object.keys(defaultNotificationSettings.events) as NotificationEventKey[]).map(key => [
      key,
      normalizeEventSetting(events[key], defaultNotificationSettings.events[key])
    ])
  ) as Record<NotificationEventKey, NotificationEventSetting>;

  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : defaultNotificationSettings.enabled,
    inAppEnabled: typeof settings.inAppEnabled === 'boolean' ? settings.inAppEnabled : defaultNotificationSettings.inAppEnabled,
    pushEnabled: typeof settings.pushEnabled === 'boolean' ? settings.pushEnabled : defaultNotificationSettings.pushEnabled,
    soundEnabled: typeof settings.soundEnabled === 'boolean' ? settings.soundEnabled : defaultNotificationSettings.soundEnabled,
    onlyPushWhenAway: typeof settings.onlyPushWhenAway === 'boolean' ? settings.onlyPushWhenAway : defaultNotificationSettings.onlyPushWhenAway,
    groupByChat: typeof settings.groupByChat === 'boolean' ? settings.groupByChat : defaultNotificationSettings.groupByChat,
    maxInboxItems: typeof settings.maxInboxItems === 'number' ? Math.min(Math.max(Math.round(settings.maxInboxItems), 10), 200) : defaultNotificationSettings.maxInboxItems,
    quietHours: {
      enabled: typeof quietHours.enabled === 'boolean' ? quietHours.enabled : defaultNotificationSettings.quietHours.enabled,
      start: typeof quietHours.start === 'string' ? quietHours.start : defaultNotificationSettings.quietHours.start,
      end: typeof quietHours.end === 'string' ? quietHours.end : defaultNotificationSettings.quietHours.end,
      allowErrors: typeof quietHours.allowErrors === 'boolean' ? quietHours.allowErrors : defaultNotificationSettings.quietHours.allowErrors
    },
    events: normalizedEvents
  };
};

export const loadNotificationSettings = () => {
  if (typeof window === 'undefined') return defaultNotificationSettings;
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
  } catch {
    return defaultNotificationSettings;
  }
};

export const saveNotificationSettings = (settings: NotificationSettings) => {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: normalized }));
  return normalized;
};

export const subscribeNotificationSettings = (listener: (settings: NotificationSettings) => void) => {
  const handler = (event: Event) => {
    if (event instanceof CustomEvent) {
      listener(normalizeSettings(event.detail));
    }
  };
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
};

export const requestPushPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
};

const getMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return Math.min(Math.max(hour, 0), 23) * 60 + Math.min(Math.max(minute, 0), 59);
};

const isQuietNow = (settings: NotificationSettings, severity: NotificationSeverity) => {
  if (!settings.quietHours.enabled) return false;
  if (severity === 'error' && settings.quietHours.allowErrors) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const start = getMinutes(settings.quietHours.start);
  const end = getMinutes(settings.quietHours.end);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
};

const getDelivery = (settings: NotificationSettings, type: NotificationEventKey, severity: NotificationSeverity): NotificationDelivery => {
  const eventSetting = settings.events[type] || defaultNotificationSettings.events[type];
  if (!settings.enabled || !eventSetting.enabled) {
    return { inApp: false, push: false, sound: false };
  }

  const quiet = isQuietNow(settings, severity);
  const away = typeof document !== 'undefined' ? document.visibilityState !== 'visible' : true;
  const pushAllowedByFocus = !settings.onlyPushWhenAway || away;

  return {
    inApp: settings.inAppEnabled && eventSetting.inApp,
    push: !quiet && settings.pushEnabled && eventSetting.push && pushAllowedByFocus,
    sound: !quiet && settings.soundEnabled && eventSetting.sound
  };
};

const isViewingChat = (chatId?: string) => {
  if (!chatId || typeof window === 'undefined') return false;
  return window.location.pathname === `/chat/${chatId}`;
};

const getInbox = () => {
  if (typeof window === 'undefined') return [] as StoredNotification[];
  try {
    const parsed = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecord).map(item => item as StoredNotification) : [];
  } catch {
    return [];
  }
};

export const loadNotificationInbox = () => getInbox();

export const saveNotificationInbox = (items: StoredNotification[]) => {
  localStorage.setItem(INBOX_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(INBOX_EVENT, { detail: items }));
  return items;
};

export const subscribeNotificationInbox = (listener: (items: StoredNotification[]) => void) => {
  const handler = (event: Event) => {
    if (event instanceof CustomEvent && Array.isArray(event.detail)) {
      listener(event.detail as StoredNotification[]);
    }
  };
  window.addEventListener(INBOX_EVENT, handler);
  return () => window.removeEventListener(INBOX_EVENT, handler);
};

export const publishDeepChatNotification = (input: {
  id: string;
  type: NotificationEventKey;
  title: string;
  description: string;
  severity?: NotificationSeverity;
  chatId?: string;
  href?: string;
}) => {
  if (input.type === 'responseFinished' && isViewingChat(input.chatId)) return null;

  const settings = loadNotificationSettings();
  const severity = input.severity || 'info';
  const delivery = getDelivery(settings, input.type, severity);
  if (!delivery.inApp && !delivery.push && !delivery.sound) return null;

  const detail: DeepChatNotificationDetail = {
    id: input.id,
    type: input.type,
    title: input.title,
    description: input.description,
    severity,
    chatId: input.chatId,
    href: input.href,
    delivery,
    unread: true,
    time: 'Now',
    createdAt: new Date().toISOString()
  };

  if (delivery.push && 'Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(detail.title, {
      body: detail.description,
      tag: settings.groupByChat && detail.chatId ? `${detail.type}-${detail.chatId}` : detail.id
    });
    notification.onclick = () => {
      window.focus();
      if (detail.href) window.location.href = detail.href;
    };
  }

  window.dispatchEvent(new CustomEvent('deepchat:notification', { detail }));
  return detail;
};

export const addNotificationToInbox = (detail: DeepChatNotificationDetail) => {
  const settings = loadNotificationSettings();
  const current = getInbox();
  const item: StoredNotification = {
    id: detail.id,
    type: detail.type,
    title: detail.title,
    description: detail.description,
    severity: detail.severity,
    time: detail.time,
    createdAt: detail.createdAt,
    unread: detail.unread,
    chatId: detail.chatId,
    href: detail.href
  };
  const next = [item, ...current.filter(existing => existing.id !== item.id)].slice(0, settings.maxInboxItems);
  return saveNotificationInbox(next);
};

export const markNotificationRead = (id: string) => {
  return saveNotificationInbox(getInbox().map(item => item.id === id ? { ...item, unread: false } : item));
};

export const markAllNotificationsRead = () => {
  return saveNotificationInbox(getInbox().map(item => ({ ...item, unread: false })));
};

export const clearNotificationInbox = () => saveNotificationInbox([]);
