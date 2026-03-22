import React, { useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";

export default function SpacesScreen() {
  const insets = useSafeAreaInsets();
  const [selectedFolderId, setSelectedFolderId] = useState("general");

  const folders = useMemo(
    () => [
      { id: "personal", label: "Personal", icon: "person-circle", color: "#4F46E5", count: 0 },
      { id: "finance", label: "Finance", icon: "wallet", color: "#16A34A", count: 0 },
      { id: "health", label: "Health", icon: "heart", color: "#DC2626", count: 0 },
      { id: "research", label: "Research", icon: "search", color: "#2563EB", count: 0 },
      { id: "travel", label: "Travel", icon: "airplane", color: "#F97316", count: 0 },
      { id: "general", label: "General", icon: "folder", color: "#6B7280", count: 0 },
    ],
    [],
  );

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) || folders[0];

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
          backgroundColor: "#FFFFFF",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 30, fontFamily: "Fraunces_700Bold", color: "#111827" }}>Spaces</Text>
        <HeaderSearchButton />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 14, color: "#6B7280", lineHeight: 22 }}>
          Browse static agent folders locally. File contents can be added later.
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20 }}>
        <FlatList
          data={folders}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={{ gap: 14 }}
          contentContainerStyle={{ gap: 14, paddingBottom: 22 }}
          renderItem={({ item }) => {
            const selected = item.id === selectedFolderId;
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedFolderId(item.id)}
                style={{
                  flex: 1,
                  minHeight: 122,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: selected ? "#C7D2FE" : "#E5E7EB",
                  backgroundColor: "#FFFFFF",
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: `${item.color}18`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={{ marginTop: 16, fontSize: 16, fontFamily: "DMSans_700Bold", color: "#111827" }}>
                  {item.label}
                </Text>
                <Text style={{ marginTop: 4, fontSize: 13, color: "#6B7280" }}>
                  {item.count} items
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        <View style={{ borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 16 }}>
          <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: "#6B7280", textTransform: "uppercase" }}>
            {selectedFolder.label} files
          </Text>
          <View style={{ paddingTop: 18 }}>
            <Text style={{ fontSize: 15, color: "#111827" }}>No files yet.</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: "#6B7280" }}>
              This folder is empty for now.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
