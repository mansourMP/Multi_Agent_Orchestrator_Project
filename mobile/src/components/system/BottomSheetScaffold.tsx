import { useCallback, useEffect, useMemo, useRef, type PropsWithChildren, type ReactNode } from "react";
import { Text, View } from "react-native";

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetView,
  useBottomSheetSpringConfigs,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/src/theme/useAppTheme";
import {
  MOBILE_BOTTOM_SHEET_SNAP_POINTS,
  MOBILE_SPRING_PRESETS,
} from "@/src/ui/motion";

type BottomSheetScaffoldProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  snapPoints?: readonly string[];
}>;

export function RootBottomSheetProvider({ children }: PropsWithChildren) {
  return <BottomSheetModalProvider>{children}</BottomSheetModalProvider>;
}

export function BottomSheetScaffold({
  visible,
  onClose,
  title,
  subtitle,
  footer,
  snapPoints = MOBILE_BOTTOM_SHEET_SNAP_POINTS.medium,
  children,
}: BottomSheetScaffoldProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const modalRef = useRef<BottomSheetModal>(null);
  const points = useMemo(() => [...snapPoints], [snapPoints]);

  const animationConfigs = useBottomSheetSpringConfigs({
    damping: MOBILE_SPRING_PRESETS.sheet.damping,
    mass: MOBILE_SPRING_PRESETS.sheet.mass,
    overshootClamping: MOBILE_SPRING_PRESETS.sheet.overshootClamping,
    stiffness: MOBILE_SPRING_PRESETS.sheet.stiffness,
  });

  useEffect(() => {
    if (visible) {
      modalRef.current?.present();
      return;
    }
    modalRef.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.2}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      index={0}
      snapPoints={points}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      animationConfigs={animationConfigs}
      backgroundStyle={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderTopLeftRadius: theme.radii.xl,
        borderTopRightRadius: theme.radii.xl,
        shadowColor: "#121417",
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 8,
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.indicator,
        width: 42,
        height: 4,
      }}
      onDismiss={onClose}
    >
      <BottomSheetView
        style={{
          gap: theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.lg,
        }}
      >
        {title || subtitle ? (
          <View style={{ gap: theme.spacing.xs }}>
            {title ? (
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.typography.section,
                  fontFamily: "Fraunces_700Bold",
                }}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.typography.meta,
                  lineHeight: 18,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
        {footer}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
