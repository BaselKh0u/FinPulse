import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

let alertSoundEnabled = true;
let pushEnabled = true;
let warnedAndroidExpoGoPush = false;

function isAndroidExpoGo(): boolean {
  return Platform.OS === "android" && Constants.appOwnership === "expo";
}

export function shouldUseAndroidExpoGoLocalAlertFallback(): boolean {
  return isAndroidExpoGo();
}

export function setAlertSoundEnabled(enabled: boolean) {
  alertSoundEnabled = enabled;
}

export function setPushEnabled(enabled: boolean) {
  pushEnabled = enabled;
}

let notificationHandlerInstalled = false;

async function ensureNotificationHandler() {
  if (notificationHandlerInstalled) {
    return;
  }
  const Notifications = await import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: alertSoundEnabled,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  notificationHandlerInstalled = true;
}

export type RegisterPushOptions = {
  /**
   * When true, only registers for a push token if permission is already granted — no system prompt.
   * Use on cold start so first-time users are not asked before onboarding; call without silent after signup or from Settings.
   */
  silent?: boolean;
};

export async function registerForPushNotifications(
  options: RegisterPushOptions = {}
): Promise<string | null> {
  if (isAndroidExpoGo()) {
    if (!warnedAndroidExpoGoPush) {
      warnedAndroidExpoGoPush = true;
      console.warn("Expo Go on Android does not support remote push tokens. Using local alert fallback.");
    }
    return null;
  }

  const silent = options.silent === true;

  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device.");
    return null;
  }

  await ensureNotificationHandler();
  const Notifications = await import("expo-notifications");

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    if (silent) {
      return null;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Stock Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2C66FF",
      sound: "default",
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch (e) {
    console.warn("Expo push token failed:", e);
    return null;
  }
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (!pushEnabled) {
    return;
  }
  await ensureNotificationHandler();
  const Notifications = await import("expo-notifications");
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: data ?? {},
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
  });
}

export async function scheduleAlertNotification(
  symbol: string,
  alertType: string,
  description: string
) {
  await sendLocalNotification(`${symbol} Alert`, `${alertType}: ${description}`, {
    symbol,
    alertType,
  });
}

export async function addNotificationReceivedListener(
  callback: (notification: import("expo-notifications").Notification) => void
) {
  if (isAndroidExpoGo()) {
    return { remove: () => {} };
  }
  await ensureNotificationHandler();
  const Notifications = await import("expo-notifications");
  return Notifications.addNotificationReceivedListener(callback);
}

export async function addNotificationResponseListener(
  callback: (response: import("expo-notifications").NotificationResponse) => void
) {
  if (isAndroidExpoGo()) {
    return { remove: () => {} };
  }
  await ensureNotificationHandler();
  const Notifications = await import("expo-notifications");
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function getBadgeCount(): Promise<number> {
  if (isAndroidExpoGo()) {
    return 0;
  }
  const Notifications = await import("expo-notifications");
  return Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number) {
  if (isAndroidExpoGo()) {
    return;
  }
  const Notifications = await import("expo-notifications");
  await Notifications.setBadgeCountAsync(count);
}
