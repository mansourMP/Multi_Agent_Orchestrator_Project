import React, { useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";
import { buildAgentDirectory } from "@/src/lib/agents";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function SpacesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { agents: discoveredAgents, runs, artifacts, loading } = useMobileOverviewData();
  const agentDirectory = useMemo(() => buildAgentDirectory(discoveredAgents), [discoveredAgents]);
  const [selectedFolderId, setSelectedFolderId] = useState("personal-assistant");
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);

  const runsById = useMemo(() => new Map(runs.map((run) => [run.run_id, run])), [runs]);

  const folders = useMemo(
    () =>
      agentDirectory.map((agent) => {
        const relatedRuns = runs.filter((run) => run.agent_role === agent.runtimeRole || run.agent_role === agent.id);
        const relatedArtifacts = artifacts.filter((artifact) => {
          const relatedRun = artifact.run_id ? runsById.get(artifact.run_id) : null;
          return relatedRun?.agent_role === agent.runtimeRole || relatedRun?.agent_role === agent.id;
        });

        return {
          id: agent.id,
          label: agent.label.replace(" Agent", ""),
          icon: agent.icon,
          color: agent.avatarColor,
          count: relatedRuns.length + relatedArtifacts.length,
          subtitle: agent.subtitle,
          runs: relatedRuns,
          artifacts: relatedArtifacts,
        };
      }),
    [agentDirectory, artifacts, runs, runsById],
  );

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) || folders[0];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: theme.colors.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 30, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Spaces</Text>
          <Text style={{ marginTop: 3, fontSize: 13, color: theme.colors.textSecondary }}>Memory, files, and saved outputs</Text>
        </View>
        <HeaderSearchButton />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>
          Browse each agent’s saved context, recent work, and outputs in one place.
        </Text>
      </View>

      {!connected ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View
            style={{
              padding: 16,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text style={{ fontSize: 14, color: theme.colors.text, fontFamily: "DMSans_700Bold" }}>Connect your runtime first</Text>
            <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>
              Spaces become useful once runs and outputs are syncing from your backend.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/chats/settings")}
              style={{
                marginTop: 14,
                height: 40,
                borderRadius: 14,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "flex-start",
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Open settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

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
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: selected ? "rgba(17, 24, 39, 0.2)" : theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: selected ? `${item.color}22` : `${item.color}14`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={{ marginTop: 16, fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                  {item.label}
                </Text>
                <Text style={{ marginTop: 4, fontSize: 13, color: theme.colors.textSecondary }}>
                  {item.count} items
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingTop: 6 }}>
                <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>Loading spaces...</Text>
              </View>
            ) : null
          }
        />

        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 16,
          }}
        >
          {selectedFolder ? (
            <>
              <Text style={{ fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, textTransform: "uppercase" }}>
                {selectedFolder.label} space
              </Text>
              <Text style={{ marginTop: 10, fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {selectedFolder.subtitle || "Recent memory and outputs"}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 21 }}>
                {selectedFolder.runs.length
                  ? `${selectedFolder.runs.length} recent runs available.`
                  : "No recent runs yet."}{" "}
                {selectedFolder.artifacts.length
                  ? `${selectedFolder.artifacts.length} saved outputs linked.`
                  : "No saved outputs yet."}
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  onPress={() => router.push(`/chats/${selectedFolder.id}`)}
                  style={{
                    height: 40,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    backgroundColor: theme.colors.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Open chat</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 18, gap: 10 }}>
                {selectedFolder.runs.slice(0, 2).map((run) => (
                  <View
                    key={run.run_id}
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.background,
                      padding: 14,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                      {run.summary || run.run_id}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 12, color: theme.colors.textSecondary }}>
                      {run.status}
                    </Text>
                  </View>
                ))}
                {!selectedFolder.runs.length && !selectedFolder.artifacts.length ? (
                  <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                    This space is empty for now.
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>No spaces available yet.</Text>
          )}
        </View>
      </View>
    </View>
  );
}
