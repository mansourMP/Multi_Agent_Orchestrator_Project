import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { APP_CATALOG } from "@/src/lib/appCatalog";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const CURATED_ORDER = ["calorie_tracking", "flashcards"] as const;

function sortApps(items: typeof APP_CATALOG) {
  const order = new Map<string, number>(CURATED_ORDER.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const orderA = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const orderB = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

function AppIconTile({
  app,
  onPress,
}: {
  app: (typeof APP_CATALOG)[number];
  onPress: (app: (typeof APP_CATALOG)[number]) => void;
}) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={() => onPress(app)}
      style={{
        width: "22%",
        minWidth: 72,
        maxWidth: 88,
        alignItems: "center",
        gap: 8,
      }}
    >
      <BrandedAppIcon appId={app.id} icon={app.icon ?? "apps-outline"} size={66} />
      <Text
        style={{
          fontSize: 12,
          lineHeight: 15,
          fontFamily: "DMSans_500Medium",
          color: theme.colors.text,
          textAlign: "center",
        }}
        numberOfLines={2}
      >
        {app.name}
      </Text>
    </TouchableOpacity>
  );
}

export default function AppsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const curatedApps = React.useMemo(() => sortApps(APP_CATALOG), []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="Applications"
        subtitle="Focused mini applications."
        action={{
          accessibilityLabel: "Open App Store",
          label: "Store",
          icon: "bag-handle-outline",
          onPress: () => router.push("/apps/store"),
          variant: "secondary",
        }}
      />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 22,
          columnGap: 8,
          paddingTop: 6,
        }}
      >
        {curatedApps.map((app) => (
          <AppIconTile key={app.id} app={app} onPress={(next) => router.push(`/apps/${next.id}/home`)} />
        ))}
      </View>
    </ScrollView>
  );
}
