import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "@/src/theme/useAppTheme";

export default function TabsLayout() {
  const theme = useAppTheme();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: "#FFFFFF",
          borderTopColor: "rgba(17, 24, 39, 0.08)",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "DMSans_500Medium",
        },
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<
            string,
            { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
          > = {
            chats: {
              active: "chatbubble-ellipses",
              inactive: "chatbubble-ellipses-outline",
            },
            "apps/index": {
              active: "grid",
              inactive: "grid-outline",
            },
            "today/index": {
              active: "sunny",
              inactive: "sunny-outline",
            },
            "spaces/index": {
              active: "folder",
              inactive: "folder-outline",
            },
          };
          const icon = iconMap[route.name];
          return <Ionicons name={icon ? (focused ? icon.active : icon.inactive) : "ellipse-outline"} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="apps/index" options={{ title: "Apps" }} />
      <Tabs.Screen name="today/index" options={{ title: "Today" }} />
      <Tabs.Screen name="spaces/index" options={{ title: "Spaces" }} />
    </Tabs>
  );
}
