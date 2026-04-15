import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

let alertSoundEnabled = true;
let pushEnabled = true;

export function setAlertSoundEnabled(enabled: boolean) {
  alertSoundEnabled = enabled;
}
export function setPushEnabled(enabled: boolean) {
  pushEnabled = enabled;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: alertSoundEnabled,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  const silent = options.silent === true;

  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device.");
    return null;
  }

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
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    // projectId not available in Expo Go — push tokens work in dev builds / production
    return null;
  }
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (!pushEnabled) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: data ?? {},
    },
    trigger: { type: "timeInterval" as const, seconds: 1 },
  });
}

export async function scheduleAlertNotification(
  symbol: string,
  alertType: string,
  description: string
) {
  await sendLocalNotification(
    `${symbol} Alert`,
    `${alertType}: ${description}`,
    { symbol, alertType }
  );
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}
