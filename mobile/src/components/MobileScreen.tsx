import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/theme";

export function MobileScreen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const theme = useTheme();
  const content = (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 20 }}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.app }}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{content}</View>
      )}
    </SafeAreaView>
  );
}
