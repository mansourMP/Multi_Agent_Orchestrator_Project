import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from "@tanstack/react-query";
import { 
  DMSans_400Regular, 
  DMSans_500Medium, 
  DMSans_700Bold 
} from '@expo-google-fonts/dm-sans';
import { 
  Fraunces_400Regular, 
  Fraunces_700Bold 
} from '@expo-google-fonts/fraunces';

import { initDatabase } from "@/src/services/db";
import { SessionProvider } from "@/src/lib/session-context";
import { ThemeProvider } from "@/src/theme";
import { queryClient } from "@/src/lib/queryClient";
import { configureNotificationChannelAsync, getNotificationHref } from "@/src/lib/notifications";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = Font.useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Fraunces_400Regular,
    Fraunces_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
        await configureNotificationChannelAsync();
      } catch (e) {
        console.warn('Database init error:', e);
      } finally {
        if (fontsLoaded) {
          await SplashScreen.hideAsync();
        }
      }
    }
    prepare();
  }, [fontsLoaded]);

  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse) {
      const href = getNotificationHref(response.notification.request.content.data as Record<string, unknown>);
      if (!href) return;
      requestAnimationFrame(() => {
        router.push(href as never);
      });
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => {
      subscription.remove();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SessionProvider>
            <SafeAreaProvider>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen 
                  name="settings" 
                  options={{ 
                    animation: 'slide_from_left',
                    presentation: 'card' 
                  }} 
                />
                <Stack.Screen
                  name="notifications"
                  options={{
                    animation: "slide_from_left",
                    presentation: "card",
                  }}
                />
                <Stack.Screen
                  name="status"
                  options={{
                    animation: "slide_from_left",
                    presentation: "card",
                  }}
                />
                <Stack.Screen
                  name="apps/store"
                  options={{
                    presentation: "transparentModal",
                    animation: "slide_from_bottom",
                    animationDuration: 520,
                  }}
                />
                <Stack.Screen
                  name="apps/[id]/home"
                  options={{
                    presentation: "transparentModal",
                    animation: "slide_from_bottom",
                    animationDuration: 520,
                  }}
                />
                <Stack.Screen
                  name="session"
                  options={{
                    animation: "slide_from_left",
                    presentation: "card",
                  }}
                />
              </Stack>
            </SafeAreaProvider>
          </SessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
