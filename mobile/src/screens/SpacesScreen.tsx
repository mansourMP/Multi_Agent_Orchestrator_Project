import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TransientBanner } from "@/src/components/TransientBanner";
import { useSessionState } from "@/src/lib/session-context";
import { mobileApi } from "@/src/lib/api";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useTransientBanner } from "@/src/lib/useTransientBanner";

type FileItem = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
  updated_at?: string;
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
  const [items, setItems] = useState<FileItem[]>([]);
  const [search, setSearch] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerName, setViewerName] = useState("");
  const [viewerPath, setViewerPath] = useState("");
  const [viewerContent, setViewerContent] = useState("");
  const { banner, showBanner } = useTransientBanner();

  const refreshFiles = useCallback(async () => {
    if (!session?.runtimeUrl || !session?.runtimeKey) {
      setItems([]);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const payload = await mobileApi.listFiles(session, currentPath || undefined);
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      const normalized = rows
        .map((item: any) => ({
          name: String(item?.name ?? item?.label ?? item?.path ?? ""),
          path: String(item?.path ?? ""),
          kind: item?.kind === "dir" ? "dir" : "file",
          size: typeof item?.size === "number" ? item.size : undefined,
          updated_at: item?.updated_at ?? item?.modified_at ?? undefined,
        }))
        .filter((item) => item.path);
      setItems(normalized);
    } catch (err) {
      console.warn("Failed to load files", err);
      setError("Unable to reach local core.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [session, currentPath]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const goUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  const openItem = async (item: FileItem) => {
    if (item.kind === "dir") {
      setCurrentPath(item.path);
      return;
    }
    if (!session?.runtimeUrl || !session?.runtimeKey) return;
    setViewerOpen(true);
    setViewerName(item.name);
    setViewerPath(item.path);
    setViewerContent("Loading...");
    try {
      const payload = await mobileApi.readFile(session, item.path);
      setViewerContent(String(payload?.content ?? ""));
    } catch (err) {
      setViewerContent("Unable to read file.");
    }
  };

  const filtered = useMemo(
    () => items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  );
  const recentItems = filtered.slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {banner ? <TransientBanner message={banner.message} tone={banner.tone} /> : null}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Text style={{ fontSize: 22, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>Spaces</Text>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            marginBottom: 12,
          }}
        >
          <TouchableOpacity onPress={goUp} disabled={!currentPath}>
            <Ionicons name="arrow-up" size={16} color={currentPath ? theme.colors.text : theme.colors.textSecondary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: theme.colors.text }}>{currentPath ? `/${currentPath}` : "/"}</Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
          <TextInput
            style={{ marginLeft: 8, flex: 1, fontSize: 14, color: theme.colors.text }}
            placeholder="Search files..."
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
        {!session?.runtimeUrl || !session?.runtimeKey ? (
          <Text style={{ color: theme.colors.textSecondary }}>Connect your local core in Settings to browse files.</Text>
        ) : loading ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : error ? (
          <Text style={{ color: theme.colors.textSecondary }}>{error}</Text>
        ) : filtered.length === 0 ? (
          <View style={{ paddingTop: 24 }}>
            <Text style={{ fontSize: 15, color: theme.colors.text }}>No files yet.</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 }}>
              Files stored on your device will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.path}
            ListHeaderComponent={
              <View style={{ paddingBottom: 12 }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8 }}>Recent items</Text>
                <View
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  {recentItems.map((item) => (
                    <TouchableOpacity key={item.path} onPress={() => openItem(item)}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View>
                          <Text style={{ fontSize: 14, color: theme.colors.text }}>{item.name}</Text>
                          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                            {item.kind === "dir" ? "Folder" : formatBytes(item.size)}
                          </Text>
                        </View>
                        <Ionicons
                          name={item.kind === "dir" ? "chevron-forward" : "document-text"}
                          size={16}
                          color={theme.colors.textSecondary}
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 16 }}>All files</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => openItem(item)}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: theme.colors.surface,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={item.kind === "dir" ? "folder" : "document-text"}
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: theme.colors.text }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                      {item.kind === "dir" ? "Folder" : formatBytes(item.size)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <Modal visible={viewerOpen} animationType="slide" onRequestClose={() => setViewerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top, 20), paddingHorizontal: 20, paddingBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{viewerName}</Text>
            <TouchableOpacity 
              onPress={() => setViewerOpen(false)}
              style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={{
              flex: 1,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              padding: 12,
              fontSize: 14,
              color: theme.colors.text,
              textAlignVertical: "top",
            }}
            multiline
            editable={false}
            value={viewerContent}
          />
        </View>
      </Modal>
    </View>
  );
}
