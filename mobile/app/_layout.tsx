import { Stack, useRouter } from "expo-router";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  registerForPushNotifications,
  addNotificationResponseListener,
} from "@/services/notification.service";
import { getPreferences } from "@/services/user.service";
import { getAccessToken, subscribeSessionChange } from "@/stores/auth.storage";
import { applyTheme } from "@/theme/colors";
import { ThemeContext } from "@/stores/theme.store";
import { GestureHandlerRootView } from "react-native-gesture-handler";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
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
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    registerForPushNotifications({ silent: true });

    notificationListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.symbol) {
        router.push(`/stock/${data.symbol}`);
      }
    });

    return () => {
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

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeContext.Provider value={{ isDark, toggleDark }}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}