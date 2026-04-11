import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getCatalogApp } from "@/src/lib/appCatalog";

export function BrandedAppIcon({
  appId,
  icon,
  size = 58,
}: {
  appId: string;
  icon: string;
  size?: number;
}) {
  const meta = getCatalogApp(appId);
  const background = meta?.iconBackground ?? "#111827";
  const foreground = meta?.iconForeground ?? "#FFFFFF";
  const accent = meta?.iconAccent ?? "rgba(255,255,255,0.24)";

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(16, Math.round(size * 0.31)),
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 4,
      }}
    >
      <View
        style={{
          position: "absolute",
          width: Math.round(size * 0.64),
          height: Math.round(size * 0.64),
          borderRadius: Math.round(size * 0.32),
          backgroundColor: accent,
          top: -Math.round(size * 0.12),
          right: -Math.round(size * 0.08),
        }}
      />
      <View
        style={{
          position: "absolute",
          width: Math.round(size * 0.3),
          height: Math.round(size * 0.3),
          borderRadius: Math.round(size * 0.15),
          backgroundColor: "rgba(255,255,255,0.12)",
          bottom: Math.round(size * 0.1),
          left: Math.round(size * 0.1),
        }}
      />
      <Ionicons name={icon as any} size={Math.round(size * 0.48)} color={foreground} />
    </View>
  );
}
