import React from "react";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/src/theme/useAppTheme";

export function HeaderSearchButton() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="search-outline" size={18} color="#111827" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#FFFFFF",
            paddingTop: insets.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 28, fontFamily: "Fraunces_700Bold", color: "#111827" }}>Search</Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="close" size={22} color="#111827" />
            </TouchableOpacity>
          </View>

          <View
            style={{
              marginTop: 18,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              backgroundColor: "#FFFFFF",
              paddingHorizontal: 12,
              height: 48,
            }}
          >
            <Ionicons name="search-outline" size={18} color={theme.colors.textSecondary} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={theme.colors.textSecondary}
              style={{ flex: 1, marginLeft: 10, color: theme.colors.text, fontSize: 15 }}
            />
          </View>

          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
            <Ionicons name="search-outline" size={28} color="#9CA3AF" />
            <Text style={{ marginTop: 16, fontSize: 16, color: "#6B7280", textAlign: "center", lineHeight: 24 }}>
              Search agents, files, and conversations
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
