import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/src/theme/useAppTheme";
import { MotionTabBarButton } from "@/src/components/navigation/MotionTabBarButton";

export default function TabsLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const rootSegment = segments.at(0);
  const sectionSegment = segments.at(1);
  const leafSegment = segments.at(2);
  const isChatThread =
    rootSegment === "(tabs)" &&
    (sectionSegment === "kin" || sectionSegment === "chats") &&
    leafSegment === "[id]";
  const hiddenTabBar = isChatThread;

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          void Haptics.selectionAsync();
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: "#7C838D",
        tabBarStyle: {
          display: hiddenTabBar ? "none" : "flex",
          position: "absolute",
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 10),
          height: 68,
          paddingTop: 7,
          paddingBottom: 7,
          paddingHorizontal: 8,
          backgroundColor: theme.colors.card,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 24,
          shadowColor: "#121417",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 8,
        },
        tabBarItemStyle: {
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 18,
          marginHorizontal: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11.5,
          fontFamily: "DMSans_700Bold",
          marginTop: 2,
          paddingBottom: 0,
          letterSpacing: 0.15,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarButton: (props) => <MotionTabBarButton {...props} />,
        sceneStyle: {
          backgroundColor: theme.colors.background,
          paddingBottom: hiddenTabBar ? 0 : 88,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
            chats: { active: "chatbubble-ellipses", inactive: "chatbubble-ellipses-outline" },
            kin: { active: "people", inactive: "people-outline" },
            "apps/index": { active: "grid", inactive: "grid-outline" },
            "profile/index": { active: "person-circle", inactive: "person-circle-outline" },
          };
          const iconSet = iconMap[route.name];
          const icon = iconSet ? (focused ? iconSet.active : iconSet.inactive) : "ellipse";
          return <Ionicons name={icon} size={focused ? size + 1 : size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="chats" options={{ title: "Chat" }} />
      <Tabs.Screen name="kin" options={{ title: "Agents" }} />
      <Tabs.Screen name="apps/index" options={{ title: "Apps" }} />
      <Tabs.Screen name="profile/index" options={{ title: "You" }} />
      <Tabs.Screen name="home/index" options={{ href: null }} />
      <Tabs.Screen name="inbox/index" options={{ href: null }} />
      <Tabs.Screen name="today/index" options={{ href: null }} />
      <Tabs.Screen name="spaces/index" options={{ href: null }} />
    </Tabs>
  );
}
