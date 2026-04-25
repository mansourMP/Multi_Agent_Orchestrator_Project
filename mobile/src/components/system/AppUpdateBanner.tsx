import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";

import { useAppTheme } from "@/src/theme/useAppTheme";

export function AppUpdateBanner() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [updateReady, setUpdateReady] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) {
      return;
    }

    let active = true;
    void Updates.checkForUpdateAsync()
      .then(async (result) => {
        if (!active || !result.isAvailable) {
          return;
        }
        await Updates.fetchUpdateAsync();
        if (active) {
          setUpdateReady(true);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  if (!updateReady) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 10,
        left: 16,
        right: 16,
        zIndex: 40,
      }}
    >
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: 14,
          paddingVertical: 12,
          shadowColor: "#121417",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 8,
        }}
      >
        <Text style={{ fontSize: 13, color: theme.colors.text, fontFamily: "DMSans_700Bold" }}>
          Update ready
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 }}>
          Restart once to load the latest version.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={restarting}
          onPress={() => {
            if (restarting) {
              return;
            }
            setRestarting(true);
            void Updates.reloadAsync().catch(() => {
              setRestarting(false);
            });
          }}
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            minHeight: 34,
            paddingHorizontal: 12,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.cardHover,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.text, fontFamily: "DMSans_700Bold" }}>
            {restarting ? "Restarting…" : "Restart to update"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
