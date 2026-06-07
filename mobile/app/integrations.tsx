import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import type { MobileConnectionStatusItem } from "@/src/lib/api";
import { useMobileConnectionStatus } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type TabKey = "channels" | "apps" | "tools";

const TABS: { key: TabKey; label: string }[] = [
  { key: "channels", label: "Channels" },
  { key: "apps", label: "Apps" },
  { key: "tools", label: "Tools" },
];

export default function IntegrationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const [tab, setTab] = React.useState<TabKey>("channels");
  const statusQuery = useMobileConnectionStatus("sage");
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const items = React.useMemo(
    () => (statusQuery.data ?? []).filter((item) => categoryFor(item) === tab),
    [statusQuery.data, tab],
  );

  return (
    <MobileScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => router.back()}
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
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ScreenHeader title="Connections" subtitle="Channels, apps, and tools Sage can use." />
        </View>
      </View>

      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          padding: 4,
          flexDirection: "row",
          gap: 4,
        }}
      >
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.86}
              onPress={() => setTab(item.key)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 20,
                backgroundColor: active ? theme.colors.surface : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: active ? theme.colors.text : theme.colors.textSecondary,
                  fontSize: 13,
                  fontFamily: "DMSans_700Bold",
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!connected ? (
        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 18,
            gap: 12,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 17, fontFamily: "DMSans_700Bold" }}>
            Connect this phone first
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13.5, lineHeight: 20 }}>
            Mobile reads the same connection truth as desktop after the workspace session is linked.
          </Text>
          <ActionButton
            label="Connect phone"
            icon="phone-portrait-outline"
            variant="primary"
            onPress={() => router.push("/session" as never)}
          />
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        {items.length ? (
          items.map((item) => (
            <ConnectionRow key={item.id} item={item} onChooseComputer={() => router.push("/machines" as never)} />
          ))
        ) : (
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              padding: 18,
              gap: 6,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontFamily: "DMSans_700Bold" }}>
              {statusQuery.isLoading ? "Loading connections..." : "No items in this lane yet"}
            </Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13.5, lineHeight: 20 }}>
              This screen only shows backend-certified connection records. Planned lanes stay out of the happy path.
            </Text>
          </View>
        )}
      </View>
    </MobileScreen>
  );
}

function ConnectionRow({
  item,
  onChooseComputer,
}: {
  item: MobileConnectionStatusItem;
  onChooseComputer: () => void;
}) {
  const theme = useTheme();
  const status = statusFor(item);
  const icon = iconFor(item);
  const title = item.display_name || item.label || item.id;
  const description = item.description || fallbackDescription(item);
  const canChooseComputer = item.next_action === "choose_agent_computer";

  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 16,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={21} color={theme.colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, fontFamily: "DMSans_700Bold" }}>{title}</Text>
          <Text style={{ marginTop: 3, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {description}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            backgroundColor: status.background,
            paddingHorizontal: 9,
            paddingVertical: 5,
          }}
        >
          <Text style={{ color: status.color, fontSize: 11.5, fontFamily: "DMSans_700Bold" }}>
            {status.label}
          </Text>
        </View>
      </View>

      {canChooseComputer ? (
        <ActionButton
          label="Choose Agent Computer"
          icon="desktop-outline"
          variant="primary"
          onPress={onChooseComputer}
        />
      ) : item.setup_available && item.launch_status !== "planned" ? (
        <ActionButton
          label="Finish setup on desktop"
          icon="open-outline"
          disabled
        />
      ) : null}
    </View>
  );
}

function categoryFor(item: MobileConnectionStatusItem): TabKey {
  const lane = String(item.lane || "").toLowerCase();
  const id = String(item.id || "").toLowerCase();
  if (lane.includes("channel") || id.includes("telegram") || id.includes("whatsapp") || id.includes("message")) {
    return "channels";
  }
  if (lane.includes("mcp") || lane.includes("skill") || lane.includes("computer") || id.includes("browser")) {
    return "tools";
  }
  return "apps";
}

function statusFor(item: MobileConnectionStatusItem) {
  const launch = String(item.launch_status || "").toLowerCase();
  const next = String(item.next_action || "").toLowerCase();
  const health = String(item.health_status || "").toLowerCase();
  if (launch === "planned") {
    return { label: "Planned", color: "#7C6F63", background: "rgba(124,111,99,0.10)" };
  }
  if (item.connected || item.runtime_usable || health === "healthy" || health === "online") {
    return { label: "Live", color: "#16845D", background: "rgba(22,132,93,0.12)" };
  }
  if (next === "choose_agent_computer") {
    return { label: "Choose computer", color: "#8A5A00", background: "rgba(138,90,0,0.12)" };
  }
  if (next === "blocked_offline" || health === "offline") {
    return { label: "Offline", color: "#A03D34", background: "rgba(160,61,52,0.12)" };
  }
  if (item.setup_available) {
    return { label: "Ready", color: "#5A6470", background: "rgba(90,100,112,0.12)" };
  }
  return { label: "Locked", color: "#7C6F63", background: "rgba(124,111,99,0.10)" };
}

function iconFor(item: MobileConnectionStatusItem): keyof typeof Ionicons.glyphMap {
  const id = String(item.id || "").toLowerCase();
  if (id.includes("telegram")) return "paper-plane-outline";
  if (id.includes("whatsapp")) return "chatbubble-ellipses-outline";
  if (id.includes("gmail") || id.includes("email") || id.includes("mail")) return "mail-outline";
  if (id.includes("calendar")) return "calendar-clear-outline";
  if (id.includes("github")) return "logo-github";
  if (id.includes("notion")) return "document-text-outline";
  if (id.includes("slack")) return "logo-slack";
  if (id.includes("discord")) return "logo-discord";
  if (id.includes("computer") || id.includes("browser")) return "desktop-outline";
  if (id.includes("mcp")) return "git-network-outline";
  return "link-outline";
}

function fallbackDescription(item: MobileConnectionStatusItem) {
  const lane = String(item.lane || "").replace(/_/g, " ");
  const status = String(item.status_label || item.next_action || "").replace(/_/g, " ");
  return [lane, status].filter(Boolean).join(" · ") || "Connection state comes from the platform catalog.";
}
