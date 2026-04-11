import { Text, View } from "react-native";

export function SurfaceStatusBanner({
  title = "Cloud sync is degraded",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#F59E0B",
        backgroundColor: "#FFFBEB",
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#92400E" }}>
        {title}
      </Text>
      <Text style={{ fontSize: 12, lineHeight: 18, color: "#92400E" }}>
        {message}
      </Text>
    </View>
  );
}
