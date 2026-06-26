// Browser notification helpers
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }
  return Notification.permission;
}

const SHOWN_KEY = "crm_shown_notifications_v1";

function loadShown(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SHOWN_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveShown(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  // Drop entries older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) if (v > cutoff) cleaned[k] = v;
  localStorage.setItem(SHOWN_KEY, JSON.stringify(cleaned));
}

export function notifyOnce(key: string, title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const shown = loadShown();
  if (shown[key]) return;
  try {
    new Notification(title, { body, tag: key });
    shown[key] = Date.now();
    saveShown(shown);
  } catch {
    // ignore
  }
}
