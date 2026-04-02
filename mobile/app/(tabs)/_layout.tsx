import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/src/theme/useAppTheme";

export default function TabsLayout() {
  const theme = useAppTheme();
  const segments = useSegments();
  const isChatThread =
    segments[0] === "(tabs)" &&
    (segments[1] === "kin" || segments[1] === "chats") &&
    segments[2] === "[id]";

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          display: isChatThread ? "none" : "flex",
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "DMSans_500Medium",
          marginTop: -2,
          paddingBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: -2,
        },
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
            kin: "chatbubble-ellipses",
            "apps/index": "grid",
            "home/index": "home",
            "inbox/index": "mail",
            "profile/index": "person-circle",
          };
          const icon = iconMap[route.name] ?? "ellipse";
          return <Ionicons name={icon} size={size} color={focused ? theme.colors.text : theme.colors.textSecondary} />;
        },
      })}
    >
      <Tabs.Screen name="home/index" options={{ title: "Home" }} />
      <Tabs.Screen name="kin" options={{ title: "KIN" }} />
      <Tabs.Screen name="apps/index" options={{ title: "Apps" }} />
      <Tabs.Screen name="inbox/index" options={{ title: "Inbox" }} />
      <Tabs.Screen name="profile/index" options={{ title: "Profile" }} />
      <Tabs.Screen name="chats" options={{ href: null }} />
      <Tabs.Screen name="today/index" options={{ href: null }} />
      <Tabs.Screen name="spaces/index" options={{ href: null }} />
    </Tabs>
  );
}
