import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";
import { buildAgentDirectory } from "@/src/lib/agents";

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const agents = useMemo(() => buildAgentDirectory([]), []);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  const attentionItems = [
    {
      id: "finance",
      agent: agents.find((agent) => agent.id === "finance-agent")!,
      description: "Finance Agent flagged three uncategorized expenses that need review.",
    },
    {
      id: "health",
      agent: agents.find((agent) => agent.id === "health-agent")!,
      description: "Health Agent wants a quick check-in to complete today's wellbeing log.",
    },
    {
      id: "travel",
      agent: agents.find((agent) => agent.id === "travel-agent")!,
      description: "Travel Agent has an itinerary draft ready for your next trip.",
    },
  ].filter((item) => !dismissed.includes(item.id));

  const activityFeed = [
    { id: "1", agent: "Personal Assistant", action: "drafted your daily plan", time: "8m ago" },
    { id: "2", agent: "Research Agent", action: "summarized yesterday's notes", time: "16m ago" },
    { id: "3", agent: "Finance Agent", action: "updated monthly spending totals", time: "34m ago" },
    { id: "4", agent: "Health Agent", action: "logged a hydration reminder", time: "52m ago" },
    { id: "5", agent: "Travel Agent", action: "saved a weekend itinerary draft", time: "1h ago" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 30, fontFamily: "Fraunces_700Bold", color: "#111827" }}>Good morning</Text>
          <Text style={{ marginTop: 4, fontSize: 15, color: "#6B7280" }}>{dateLabel}</Text>
        </View>
        <HeaderSearchButton />
      </View>

      <Text style={{ marginTop: 28, fontSize: 13, fontFamily: "DMSans_700Bold", color: "#6B7280", textTransform: "uppercase" }}>
        Needs attention
      </Text>
      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
        {attentionItems.map((item) => (
          <View
            key={item.id}
            style={{
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: item.agent.avatarColor,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={item.agent.icon as any} size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: "#111827" }}>{item.agent.label}</Text>
                <Text style={{ marginTop: 4, fontSize: 14, color: "#6B7280", lineHeight: 21 }}>{item.description}</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={{
                      height: 34,
                      paddingHorizontal: 14,
                      borderRadius: 17,
                      backgroundColor: "#111827",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "700" }}>Review</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDismissed((current) => [...current, item.id])}
                    style={{
                      height: 34,
                      paddingHorizontal: 14,
                      borderRadius: 17,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      backgroundColor: "#FFFFFF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#111827", fontWeight: "700" }}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>

      <Text style={{ marginTop: 28, fontSize: 13, fontFamily: "DMSans_700Bold", color: "#6B7280", textTransform: "uppercase" }}>
        Agent activity
      </Text>
      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
        {activityFeed.map((item) => (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: "#111827" }}>{item.agent}</Text>
              <Text style={{ marginTop: 3, fontSize: 14, color: "#6B7280" }}>{item.action}</Text>
            </View>
            <Text style={{ fontSize: 12, color: "#6B7280" }}>{item.time}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
