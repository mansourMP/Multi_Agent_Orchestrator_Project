import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";

import { InlineNotice } from "@/src/components/InlineNotice";
import { ListRow } from "@/src/components/ListRow";
import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSpacesStore } from "@/src/lib/spaces";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

function labelForAgent(agentId: string) {
  switch (agentId) {
    case "builder":
      return "Builder";
    case "research":
      return "Research";
    case "support":
      return "Support";
    default:
      return "Private Assistant";
  }
}

export default function SpaceDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const space = useSpacesStore((state) => (params.id ? state.getSpace(String(params.id)) : undefined));
  const { runs, artifacts } = useMobileOverviewData();

  if (!space) {
    return (
      <MobileScreen>
        <ScreenHeader title="Space" subtitle="This space could not be found." />
        <InlineNotice title="Missing space" message="Go back and choose another space." tone="error" />
      </MobileScreen>
    );
  }

  const relatedRuns = runs.filter((run) => run.agent_role === space.defaultAgentId).slice(0, 3);
  const relatedArtifacts = artifacts.slice(0, 2);

  return (
    <MobileScreen>
      <ScreenHeader title={space.name} subtitle={space.purpose} />
      <SectionCard title="Talk here" subtitle="Use this space for one clear area of life or work.">
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.cardHover,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
            This space is tied to {labelForAgent(space.defaultAgentId)} and keeps your prompts focused on {space.name.toLowerCase()}.
          </Text>
          <Pressable
            onPress={() => router.push("/")}
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Open chat</Text>
          </Pressable>
        </View>
      </SectionCard>
      <SectionCard title="Quick actions" subtitle="Shortcuts for the kinds of things you do here.">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {space.quickActions.map((action) => (
            <View
              key={action}
              style={{
                minWidth: 168,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 14,
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>{action}</Text>
            </View>
          ))}
        </ScrollView>
      </SectionCard>
      <SectionCard title="Recent work" subtitle="The latest useful activity tied to this helper.">
        <View style={{ gap: 10 }}>
          {relatedRuns.length ? (
            relatedRuns.map((run) => (
              <ListRow
                key={run.run_id}
                title={run.summary ?? run.run_id}
                subtitle={run.started_at ? `Started ${run.started_at}` : "Start time unavailable"}
                meta={run.status}
              />
            ))
          ) : (
            <InlineNotice
              title="No recent work yet"
              message="Once you start using this space, recent runs will appear here."
            />
          )}
        </View>
      </SectionCard>
      <SectionCard title="Recent results" subtitle="Useful outputs from this area.">
        <View style={{ gap: 10 }}>
          {relatedArtifacts.length ? (
            relatedArtifacts.map((artifact) => (
              <ListRow
                key={artifact.id}
                title={artifact.label}
                subtitle={artifact.kind ? `Type: ${artifact.kind}` : "Result preview"}
              />
            ))
          ) : (
            <InlineNotice
              title="No recent results"
              message="Outputs for this space will appear here after runs complete."
            />
          )}
        </View>
      </SectionCard>
    </MobileScreen>
  );
}
