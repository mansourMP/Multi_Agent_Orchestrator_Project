import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";
import { TransientBanner } from "@/src/components/TransientBanner";
import { mobileApi } from "@/src/lib/api";
import { useSessionState } from "@/src/lib/session-context";
import { useTransientBanner } from "@/src/lib/useTransientBanner";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type FileItem = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
};

const formatBytes = (value?: number) => {
  if (value === undefined || value === null) return "—";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

export default function SpacesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { banner } = useTransientBanner();
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState("general");

  const refreshFiles = useCallback(async () => {
    if (!session?.runtimeUrl || !session?.runtimeKey) {
      setItems([]);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const payload = await mobileApi.listFiles(session);
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      const normalized = rows
        .map((item: any) => ({
          name: String(item?.name ?? item?.label ?? item?.path ?? ""),
          path: String(item?.path ?? ""),
          kind: item?.kind === "dir" ? "dir" : "file",
          size: typeof item?.size === "number" ? item.size : undefined,
        }))
        .filter((item: FileItem) => item.path);
      setItems(normalized);
    } catch (err) {
      console.warn("Failed to load files", err);
      setError("Unable to reach local core.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const folderDefs = useMemo(
    () => [
      { id: "personal", label: "Personal", icon: "person-circle", color: "#4F46E5", match: ["personal", "assistant"] },
      { id: "finance", label: "Finance", icon: "wallet", color: "#16A34A", match: ["finance", "budget", "expense"] },
      { id: "health", label: "Health", icon: "heart", color: "#DC2626", match: ["health", "meal", "nutrition"] },
      { id: "research", label: "Research", icon: "search", color: "#2563EB", match: ["research", "study", "notes"] },
      { id: "travel", label: "Travel", icon: "airplane", color: "#F97316", match: ["travel", "trip", "flight"] },
      { id: "general", label: "General", icon: "folder", color: "#6B7280", match: [] },
    ],
    [],
  );

  const folders = useMemo(
    () =>
      folderDefs.map((folder) => {
        const count =
          folder.id === "general"
            ? items.length
            : items.filter((item) => {
                const haystack = `${item.name} ${item.path}`.toLowerCase();
                return folder.match.some((term) => haystack.includes(term));
              }).length;
        return { ...folder, count };
      }),
    [folderDefs, items],
  );

  const visibleItems = useMemo(() => {
    const folder = folderDefs.find((item) => item.id === selectedFolderId);
    if (!folder || folder.id === "general") return items;
    return items.filter((item) => {
      const haystack = `${item.name} ${item.path}`.toLowerCase();
      return folder.match.some((term) => haystack.includes(term));
    });
  }, [folderDefs, items, selectedFolderId]);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) || folders[0];

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      {banner ? <TransientBanner message={banner.message} tone={banner.tone} /> : null}

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
          Browse agent folders and open the files each space is holding.
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20 }}>
        {!session?.runtimeUrl || !session?.runtimeKey ? (
          <Text style={{ color: theme.colors.textSecondary }}>Connect your local core to browse files.</Text>
        ) : loading ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : error ? (
          <Text style={{ color: theme.colors.textSecondary }}>{error}</Text>
        ) : (
          <>
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
                      {item.count} {item.count === 1 ? "item" : "items"}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={{ borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 16 }}>
              <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: "#6B7280", textTransform: "uppercase" }}>
                {selectedFolder?.label} files
              </Text>
              {visibleItems.length === 0 ? (
                <View style={{ paddingTop: 18 }}>
                  <Text style={{ fontSize: 15, color: "#111827" }}>No files yet.</Text>
                  <Text style={{ marginTop: 6, fontSize: 13, color: "#6B7280" }}>
                    This folder is empty for now.
                  </Text>
                </View>
              ) : (
                visibleItems.map((item) => (
                  <View
                    key={item.path}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: "#E5E7EB",
                    }}
                  >
                    <Ionicons
                      name={item.kind === "dir" ? "folder-outline" : "document-outline"}
                      size={18}
                      color="#6B7280"
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 15, color: "#111827" }}>{item.name}</Text>
                      <Text style={{ marginTop: 3, fontSize: 12, color: "#6B7280" }}>
                        {item.kind === "dir" ? "Folder" : formatBytes(item.size)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}
