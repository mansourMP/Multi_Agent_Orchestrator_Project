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
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
            chats: "chatbubble-ellipses",
            apps: "grid",
            spaces: "folder",
            today: "sunny-outline",
          };
          return <Ionicons name={iconMap[route.name] || "ellipse"} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="apps" options={{ title: "Apps" }} />
      <Tabs.Screen name="spaces" options={{ title: "Spaces" }} />
      <Tabs.Screen name="today" options={{ title: "Today" }} />
    </Tabs>
  );
}
