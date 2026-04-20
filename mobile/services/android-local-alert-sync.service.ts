import { getStoredUserId } from "@/stores/auth.storage";
import {
  getAlerts,
  getUnreadAlertEvents,
  markAlertEventAsRead,
} from "@/services/alert.service";
import { sendLocalNotification } from "@/services/notification.service";

const POLL_MS = 25000;

let timer: ReturnType<typeof setInterval> | null = null;
let syncInFlight = false;
const seenEventIds = new Set<number>();
let warnedAuthIssue = false;

function isAuthFailure(error: unknown): boolean {
  return error instanceof Error && /session expired|invalid email or password|401|permission/i.test(error.message);
}

function titleFor(symbol: string, conditionType: string | number): string {
  const cond = String(conditionType).toLowerCase();
  if (cond.includes("percentvolatility") || cond === "2") {
    return `${symbol} Volatility Alert`;
  }
  if (cond.includes("reportreleased") || cond === "3") {
    return `${symbol} Report Alert`;
  }
  return `${symbol} Price Alert`;
}

async function syncOnce() {
  if (syncInFlight) {
    return;
  }
  syncInFlight = true;
  try {
    const userId = Number((await getStoredUserId()) ?? 0);
    if (userId <= 0) {
      return;
    }

    const [events, alerts] = await Promise.all([
      getUnreadAlertEvents(userId),
      getAlerts().catch(() => []),
    ]);

    if (!events.length) {
      return;
    }

    const symbolByStockId = new Map<number, string>();
    for (const alert of alerts) {
      if (typeof alert.stockId === "number" && alert.stockId > 0) {
        symbolByStockId.set(alert.stockId, alert.symbol.toUpperCase());
      }
    }

    const ordered = [...events].sort((a, b) => a.alertEventId - b.alertEventId);
    for (const evt of ordered) {
      if (evt.isRead || seenEventIds.has(evt.alertEventId)) {
        continue;
      }

      const symbol = symbolByStockId.get(evt.stockId) ?? `#${evt.stockId}`;
      const body = evt.details?.trim() || "An alert condition was triggered.";

      await sendLocalNotification(titleFor(symbol, evt.conditionType), body, {
        symbol,
        alertEventId: evt.alertEventId,
      });

      seenEventIds.add(evt.alertEventId);
      await markAlertEventAsRead(evt.alertEventId).catch(() => {
        // If mark-read fails, keep local seen-set to avoid notification spam in this session.
      });
    }
  } catch (error) {
    if (isAuthFailure(error)) {
      if (!warnedAuthIssue) {
        warnedAuthIssue = true;
        console.warn("Android local alert sync paused until you sign in again.");
      }
      stopAndroidLocalAlertSync();
      return;
    }
    console.warn("Android local alert sync failed:", error);
  } finally {
    syncInFlight = false;
  }
}

export function startAndroidLocalAlertSync() {
  if (timer) {
    return;
  }
  void syncOnce();
  timer = setInterval(() => {
    void syncOnce();
  }, POLL_MS);
}

export function stopAndroidLocalAlertSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  seenEventIds.clear();
  warnedAuthIssue = false;
}

