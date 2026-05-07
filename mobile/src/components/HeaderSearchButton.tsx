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
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="search-outline" size={18} color={theme.colors.text} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 28, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Search</Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View
            style={{
              marginTop: 18,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: 14,
              height: 52,
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
            <Ionicons name="search-outline" size={28} color={theme.colors.textSecondary} />
            <Text style={{ marginTop: 16, fontSize: 16, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 24 }}>
              Search chats, files, and activity
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
