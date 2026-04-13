import { Stack } from "expo-router";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  registerForPushNotifications,
  addNotificationResponseListener,
} from "@/services/notification.service";
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
    registerForPushNotifications();

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

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeContext.Provider value={{ isDark, toggleDark }}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}