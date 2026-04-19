import React from "react";
import {
  Animated,
  PanResponder,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { getCatalogApp } from "@/src/lib/appCatalog";
import { appRegistryApi } from "@/src/lib/appRegistryApi";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type CalorieOverview = {
  records?: Record<string, any>[];
};

type FlashcardsOverview = {
  current_state?: {
    decks?: Record<
      string,
      {
        cards_created?: number;
      }
    >;
  };
};

type CalorieTab = "main" | "track";
type FlashcardsTab = "create" | "cards";

export default function AppHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const appId = String(params.id || "");
  const app = getCatalogApp(appId);

  if (!app) {
    return <MissingAppScreen onBack={() => router.back()} />;
  }

  if (app.id === "calorie_tracking") {
    return <CaloriesAppScreen onBack={() => router.back()} />;
  }

  if (app.id === "flashcards") {
    return <FlashcardsAppScreen onBack={() => router.back()} />;
  }

  return <UnavailableAppScreen appName={app.name} onBack={() => router.back()} />;
}

function CaloriesAppScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const [tab, setTab] = React.useState<CalorieTab>("main");
  const [overview, setOverview] = React.useState<CalorieOverview | null>(null);
  const [photoPicked, setPhotoPicked] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!session) {
      return;
    }
    try {
      const payload = (await appRegistryApi.getCalorieOverview(session)) as CalorieOverview;
      setOverview(payload);
    } catch (error) {
      console.warn("Calories refresh failed", error);
    }
  }, [session]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const records = React.useMemo(() => (Array.isArray(overview?.records) ? overview.records : []), [overview]);

  const pickMealPhoto = React.useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== "granted") {
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled) {
        setPhotoPicked(true);
      }
    } catch (error) {
      console.warn("Calories camera flow failed", error);
    }
  }, []);

  return (
    <AppFrame
      appId="calorie_tracking"
      title="Calories"
      onBack={onBack}
      bottomInset={insets.bottom}
      tabs={
        <BottomTabs
          items={[
            { id: "main", label: "Main", icon: "camera" },
            { id: "track", label: "Track", icon: "time" },
          ]}
          activeId={tab}
          onChange={(next) => setTab(next as CalorieTab)}
        />
      }
    >
      {tab === "main" ? (
        <View style={{ flex: 1, justifyContent: "center", paddingVertical: 24 }}>
          <CenteredActionPanel
            title="Meal photo"
            detail={photoPicked ? "Photo ready." : "Take a meal photo to start."}
            actionLabel={photoPicked ? "Take another photo" : "Take meal photo"}
            onAction={pickMealPhoto}
          />
          {photoPicked ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <SecondaryButton
                label="I didn't"
                onPress={() => {
                  setPhotoPicked(false);
                }}
              />
              <PrimaryButton
                label="I ate it"
                onPress={() => {
                  setPhotoPicked(false);
                  setTab("track");
                }}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 12, paddingTop: 8 }}>
          {records.length ? (
            records.slice(0, 16).map((record) => (
              <SimpleListRow
                key={String(record.id || record.timestamp || Math.random())}
                title={String(record.meal_label || record.summary || "Meal")}
                subtitle={String(record.summary || "")}
                value={record.calories != null ? `${Math.round(Number(record.calories))} kcal` : ""}
              />
            ))
          ) : (
            <EmptyState title="No meals yet" detail="Tracked meals will appear here." />
          )}
        </View>
      )}
    </AppFrame>
  );
}

function FlashcardsAppScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const [tab, setTab] = React.useState<FlashcardsTab>("create");
  const [overview, setOverview] = React.useState<FlashcardsOverview | null>(null);
  const [selectedDeck, setSelectedDeck] = React.useState("");
  const [cards, setCards] = React.useState<Record<string, any>[]>([]);
  const [cardIndex, setCardIndex] = React.useState(0);
  const [showBack, setShowBack] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [setName, setSetName] = React.useState("");
  const [sourceText, setSourceText] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!session) {
      return;
    }
    try {
      const payload = (await appRegistryApi.getFlashcardsOverview(session)) as FlashcardsOverview;
      setOverview(payload);
      const deckNames = Object.keys(payload.current_state?.decks || {});
      setSelectedDeck((current) => current || deckNames[0] || "");
      setSetName((current) => current || deckNames[0] || "");
    } catch (error) {
      console.warn("Flashcards refresh failed", error);
    }
  }, [session]);

  const loadCards = React.useCallback(
    async (deckName: string) => {
      if (!session || !deckName) {
        setCards([]);
        return;
      }
      try {
        const payload = await appRegistryApi.retrieveFlashcardRecords(session, {
          deck: deckName,
          kind: "card_create",
          limit: 50,
        });
        const nextCards = Array.isArray(payload.items) ? payload.items : [];
        setCards(nextCards);
        setCardIndex(0);
        setShowBack(false);
      } catch (error) {
        console.warn("Flashcards card load failed", error);
      }
    },
    [session],
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (tab === "cards" && selectedDeck) {
      void loadCards(selectedDeck);
    }
  }, [loadCards, selectedDeck, tab]);

  const decks = React.useMemo(() => Object.keys(overview?.current_state?.decks || {}), [overview]);
  const activeCard = cards[cardIndex] || null;

  return (
    <AppFrame
      appId="flashcards"
      title="Flashcards"
      onBack={onBack}
      bottomInset={insets.bottom}
      tabs={
        <BottomTabs
          items={[
            { id: "create", label: "Create", icon: "add-circle" },
            { id: "cards", label: "Cards", icon: "albums" },
          ]}
          activeId={tab}
          onChange={(next) => setTab(next as FlashcardsTab)}
        />
      }
    >
      {tab === "create" ? (
        <View style={{ gap: 14, paddingTop: 8 }}>
          <LabeledInput label="Set name" value={setName} onChangeText={setSetName} placeholder="Biology set" />
          <LabeledInput
            label="Source notes"
            value={sourceText}
            onChangeText={setSourceText}
            placeholder="Paste the notes you want turned into flashcards."
            multiline
            minHeight={180}
          />
          <PrimaryButton
            label={working ? "Creating..." : "Create flashcards"}
            disabled={working || !setName.trim() || !sourceText.trim()}
            onPress={async () => {
              if (!session || !setName.trim() || !sourceText.trim()) {
                return;
              }
              try {
                setWorking(true);
                await appRegistryApi.generateFlashcards(session, {
                  deck: setName.trim(),
                  source_text: sourceText.trim(),
                  count: 8,
                });
                setSourceText("");
                await refresh();
                setSelectedDeck(setName.trim());
                setTab("cards");
              } catch (error) {
                console.warn("Flashcards generate failed", error);
              } finally {
                setWorking(false);
              }
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 14, paddingTop: 8 }}>
          {decks.length ? <ChipRow items={decks} selected={selectedDeck} onSelect={setSelectedDeck} /> : null}
          {!decks.length ? (
            <EmptyState title="No flashcards yet" detail="Create a set first." />
          ) : !activeCard ? (
            <EmptyState title="No cards in this set" detail="Create cards, then open them here." />
          ) : (
            <>
              <Text style={{ fontSize: 12, color: "#6B7280", textAlign: "center" }}>
                {selectedDeck} · {cardIndex + 1}/{cards.length}
              </Text>
              <SwipeFlashcard
                front={String(activeCard.front || activeCard.summary || "Front")}
                back={String(activeCard.back || "")}
                showBack={showBack}
                onFlip={() => setShowBack((value) => !value)}
                onNext={() => {
                  setCardIndex((value) => Math.min(value + 1, cards.length - 1));
                  setShowBack(false);
                }}
                onPrev={() => {
                  setCardIndex((value) => Math.max(value - 1, 0));
                  setShowBack(false);
                }}
                canNext={cardIndex < cards.length - 1}
                canPrev={cardIndex > 0}
              />
            </>
          )}
        </View>
      )}
    </AppFrame>
  );
}

function AppFrame({
  appId,
  title,
  onBack,
  children,
  tabs,
  bottomInset,
}: {
  appId: string;
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  tabs: React.ReactNode;
  bottomInset: number;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <BackButton onPress={onBack} />
        <BrandedAppIcon appId={appId} icon={getCatalogApp(appId)?.icon || "apps"} size={40} />
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: Math.max(bottomInset, 10) + 8,
        }}
      >
        {tabs}
      </View>
    </View>
  );
}

function BottomTabs({
  items,
  activeId,
  onChange,
}: {
  items: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.86}
            onPress={() => onChange(item.id)}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : theme.colors.border,
              backgroundColor: active ? theme.colors.accent : theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <Ionicons name={item.icon} size={17} color={active ? "#FFFFFF" : theme.colors.textSecondary} />
            <Text style={{ fontSize: 11, fontFamily: "DMSans_700Bold", color: active ? "#FFFFFF" : theme.colors.textSecondary }}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CenteredActionPanel({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        paddingVertical: 36,
      }}
    >
      <PulseOrb />
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 24, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>{title}</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary, textAlign: "center" }}>{detail}</Text>
      </View>
      <View style={{ width: "100%" }}>
        <PrimaryButton label={actionLabel} onPress={onAction} />
      </View>
    </View>
  );
}

function PulseOrb() {
  const scale = React.useRef(new Animated.Value(1)).current;
  const opacity = React.useRef(new Animated.Value(0.35)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 1100,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1100,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 1100,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 1100,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, scale]);

  return (
    <View style={{ width: 180, height: 180, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: "#E5E7EB",
          opacity,
          transform: [{ scale }],
        }}
      />
      <View
        style={{
          width: 132,
          height: 132,
          borderRadius: 66,
          backgroundColor: "#111827",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="camera" size={34} color="#FFFFFF" />
      </View>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  minHeight,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  minHeight?: number;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        multiline={multiline}
        style={{
          minHeight: multiline ? minHeight || 120 : 52,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          fontSize: 15,
          lineHeight: 22,
          color: theme.colors.text,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

function ChipRow({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {items.map((item) => {
        const active = item === selected;
        return (
          <TouchableOpacity
            key={item}
            activeOpacity={0.86}
            onPress={() => onSelect(item)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : theme.colors.border,
              backgroundColor: active ? theme.colors.accent : theme.colors.surface,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: "DMSans_700Bold", color: active ? "#FFFFFF" : theme.colors.text }}>
              {item}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function SwipeFlashcard({
  front,
  back,
  showBack,
  onFlip,
  onNext,
  onPrev,
  canNext,
  canPrev,
}: {
  front: string;
  back: string;
  showBack: boolean;
  onFlip: () => void;
  onNext: () => void;
  onPrev: () => void;
  canNext: boolean;
  canPrev: boolean;
}) {
  const theme = useTheme();
  const translateX = React.useRef(new Animated.Value(0)).current;

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12,
        onPanResponderMove: (_, gesture) => {
          translateX.setValue(gesture.dx);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -60 && canNext) {
            Animated.timing(translateX, {
              toValue: -260,
              duration: 140,
              useNativeDriver: true,
            }).start(() => {
              translateX.setValue(0);
              onNext();
            });
            return;
          }
          if (gesture.dx > 60 && canPrev) {
            Animated.timing(translateX, {
              toValue: 260,
              duration: 140,
              useNativeDriver: true,
            }).start(() => {
              translateX.setValue(0);
              onPrev();
            });
            return;
          }
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [canNext, canPrev, onNext, onPrev, translateX],
  );

  return (
    <View style={{ gap: 14 }}>
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX }],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={onFlip}
          style={{
            borderRadius: 28,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 22,
            minHeight: 260,
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            {showBack ? "Back" : "Front"}
          </Text>
          <Text
            style={{
              fontSize: showBack ? 18 : 26,
              lineHeight: showBack ? 28 : 34,
              fontFamily: showBack ? "DMSans_500Medium" : "Fraunces_700Bold",
              color: theme.colors.text,
            }}
          >
            {showBack ? back || "No answer available." : front}
          </Text>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: "center" }}>
            Tap to flip. Swipe left or right to move.
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <SecondaryButton label="Previous" onPress={onPrev} disabled={!canPrev} />
        <SecondaryButton label="Next" onPress={onNext} disabled={!canNext} />
      </View>
    </View>
  );
}

function SimpleListRow({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>{value}</Text> : null}
    </View>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 18,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>{detail}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        height: 52,
        borderRadius: 18,
        backgroundColor: "#111827",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "DMSans_700Bold" }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 13, fontFamily: "DMSans_700Bold" }}>{label}</Text>
    </TouchableOpacity>
  );
}

function MissingAppScreen({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
      <BackButton onPress={onBack} />
      <Text style={{ marginTop: 18, fontSize: 14, color: theme.colors.textSecondary }}>That app could not be found.</Text>
    </View>
  );
}

function UnavailableAppScreen({ appName, onBack }: { appName: string; onBack: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 18 }}>
      <BackButton onPress={onBack} />
      <EmptyState title={`${appName} is not in beta`} detail="This application stays hidden until it has a real product surface." />
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
    </TouchableOpacity>
  );
}
