import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
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
import { SessionProvider, useSessionState } from "@/src/lib/session-context";
import { ThemeProvider } from "@/src/theme";
import { queryClient } from "@/src/lib/queryClient";
import {
  configureNotificationChannelAsync,
  getNotificationHref,
  registerForPushNotificationsAsync,
  syncRuntimeNotifications,
} from "@/src/lib/notifications";
import {
  ensureMobileDeviceId,
  flushQueuedPersonalContextEvents,
  proposeBoundedWakeup,
  recordRoutePresence,
  rememberLinkedSession,
} from "@/src/lib/mobile-engine";
import { sessionHasRuntimeAccess } from "@/src/lib/session";

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
              <MobileRuntimeNotificationBridge />
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
                  name="artifacts"
                  options={{
                    animation: "slide_from_right",
                    presentation: "card",
                  }}
                />
                <Stack.Screen
                  name="approvals"
                  options={{
                    animation: "slide_from_right",
                    presentation: "card",
                  }}
                />
                <Stack.Screen
                  name="connectors"
                  options={{
                    animation: "slide_from_right",
                    presentation: "card",
                  }}
                />
                <Stack.Screen
                  name="machines"
                  options={{
                    animation: "slide_from_right",
                    presentation: "card",
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

function MobileRuntimeNotificationBridge() {
  const { session, saveSession, refreshSession } = useSessionState();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const routeKey = getRouteKeyFromSegments(segments);

  useEffect(() => {
    void recordRoutePresence(routeKey);
    return () => {
      void recordRoutePresence(null);
    };
  }, [routeKey]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let syncing = false;
    const syncSession = async (trigger: "startup" | "interval" | "resume") => {
      if (cancelled || syncing) return;
      syncing = true;
      try {
        const refreshedSession = await refreshSession();
        const runtimeSession = sessionHasRuntimeAccess(refreshedSession)
          ? refreshedSession
          : (sessionHasRuntimeAccess(session) ? session : null);
        if (!runtimeSession) return;
        await recordRoutePresence(routeKey);
        const deviceId = await ensureMobileDeviceId(runtimeSession.deviceId);
        const linkedSession = deviceId && deviceId !== runtimeSession.deviceId
          ? {
              ...runtimeSession,
              deviceId,
              sessionLinkedAt: runtimeSession.sessionLinkedAt || new Date().toISOString(),
            }
          : runtimeSession;
        if (linkedSession !== runtimeSession) {
          await saveSession(linkedSession);
        }
        await rememberLinkedSession(linkedSession);
        await registerForPushNotificationsAsync(linkedSession);
        const syncResult = await syncRuntimeNotifications(linkedSession);
        const flushResult = await flushQueuedPersonalContextEvents(linkedSession);
        if (syncResult.highPriorityCount > 0) {
          await proposeBoundedWakeup(linkedSession, {
            summary: `Review ${syncResult.highPriorityCount} high-priority mobile changes.`,
            reason: "mobile_runtime_attention",
            dueAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
            payload: {
              trigger,
              fresh_notifications: syncResult.freshCount,
              queued_context_events: syncResult.queuedContextEventCount,
              remaining_context_events: flushResult.remainingCount,
            },
            policyContext: {
              source: "mobile_engine",
              bounded: true,
              route_key: routeKey,
            },
          });
        }
        await queryClient.invalidateQueries({ queryKey: ["mobile"] });
      } catch (error) {
        console.warn("Notification sync failed", error);
      } finally {
        syncing = false;
      }
    };

    void syncSession("startup");
    const interval = setInterval(() => {
      void syncSession("interval");
    }, 30000);

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void recordRoutePresence(routeKey);
        void syncSession("resume");
        return;
      }
      void recordRoutePresence(null);
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [queryClient, refreshSession, routeKey, saveSession, session]);

  return null;
}

function getRouteKeyFromSegments(segments: string[]) {
  const visible = segments.filter((segment) => !segment.startsWith("(") && segment !== "_layout");
  const first = String(visible[0] || "home").toLowerCase();
  if (first === "index") return "home";
  if (first === "chats") return "chats";
  if (first === "apps") return "applications";
  if (first === "inbox" || first === "notifications") return "notifications";
  if (first === "profile") return "profile";
  if (first === "home") return "home";
  return first || "home";
}
