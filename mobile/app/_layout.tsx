import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogBox, Platform } from "react-native";
import {
  registerForPushNotifications,
  addNotificationResponseListener,
  shouldUseAndroidExpoGoLocalAlertFallback,
} from "@/services/notification.service";
import { getPreferences, registerDeviceToken } from "@/services/user.service";
import { getAccessToken, subscribeSessionChange } from "@/stores/auth.storage";
import { applyTheme } from "@/theme/colors";
import { ThemeContext } from "@/stores/theme.store";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { setCurrency } from "@/stores/currency.store";
import { setRefreshInterval } from "@/stores/refresh.store";
import {
  startAndroidLocalAlertSync,
  stopAndroidLocalAlertSync,
} from "@/services/android-local-alert-sync.service";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const notificationListener = useRef<{ remove: () => void }>();
  const [isDark, setIsDark] = useState(false);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      applyTheme(next);
      return next;
    });
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (shouldUseAndroidExpoGoLocalAlertFallback()) {
      LogBox.ignoreLogs([
        "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go",
        "`expo-notifications` functionality is not fully supported in Expo Go",
      ]);
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        const first = args[0];
        const text = typeof first === "string" ? first : first instanceof Error ? first.message : String(first ?? "");
        if (text.includes("expo-notifications: Android Push notifications")) {
          return;
        }
        originalError(...args);
      };
      return () => {
        console.error = originalError;
      };
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pushToken = await registerForPushNotifications({ silent: true });
        if (pushToken) {
          void registerDeviceToken(pushToken, Platform.OS).catch(() => {});
        }
        const sub = await addNotificationResponseListener((response) => {
          const data = response.notification.request.content.data as { symbol?: string };
          if (data?.symbol) {
            router.push(`/stock/${data.symbol}`);
          }
        });
        if (!cancelled) {
          notificationListener.current = sub;
        } else {
          sub.remove();
        }
      } catch {
        // avoid unhandled promise warnings during startup
      }
    })();

    return () => {
      cancelled = true;
      notificationListener.current?.remove();
    };
  }, [router]);

  useEffect(() => {
    let alive = true;

    const syncThemeFromUser = async () => {
      const token = await getAccessToken();
      if (!token) {
        if (!alive) return;
        setIsDark(false);
        applyTheme(false);
        return;
      }
      try {
        const prefs = await getPreferences();
        if (!alive) return;
        setIsDark(!!prefs.darkMode);
        applyTheme(!!prefs.darkMode);
        await setCurrency(prefs.currency);
        setRefreshInterval(prefs.refreshInterval);
      } catch {
        // unauthenticated startup / network issue: keep current theme
      }
    };

    void syncThemeFromUser();
    const unsub = subscribeSessionChange(() => {
      void syncThemeFromUser();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const enforceAuthRoute = async () => {
      const token = await getAccessToken();
      if (!alive) return;
      const inAuth = segments[0] === "auth";
      if (!token && !inAuth) {
        router.replace("/auth/login");
      }
    };
    void enforceAuthRoute();
    const unsub = subscribeSessionChange(() => {
      void enforceAuthRoute();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [router, segments]);

  useEffect(() => {
    let alive = true;
    const syncLocalAlertMode = async () => {
      const token = await getAccessToken();
      if (!alive) {
        return;
      }
      if (token && shouldUseAndroidExpoGoLocalAlertFallback()) {
        startAndroidLocalAlertSync();
      } else {
        stopAndroidLocalAlertSync();
      }
    };

    void syncLocalAlertMode();
    const unsub = subscribeSessionChange(() => {
      void syncLocalAlertMode();
    });

    return () => {
      alive = false;
      unsub();
      stopAndroidLocalAlertSync();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeContext.Provider value={{ isDark, toggleDark }}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}