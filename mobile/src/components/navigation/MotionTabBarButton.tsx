import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { MotionPressable } from "@/src/components/system/MotionPressable";
import { useAppTheme } from "@/src/theme/useAppTheme";
import { MOBILE_MOTION_TIMINGS } from "@/src/ui/motion";

const AnimatedView = Animated.createAnimatedComponent(View);

export function MotionTabBarButton({
  children,
  style,
  accessibilityState,
  ...props
}: BottomTabBarButtonProps) {
  const theme = useAppTheme();
  const selected = Boolean(accessibilityState?.selected);
  const active = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(selected ? 1 : 0, {
      duration: MOBILE_MOTION_TIMINGS.normal,
    });
  }, [active, selected]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      active.value,
      [0, 1],
      ["rgba(0,0,0,0)", theme.colors.cardHover],
    ),
    transform: [
      {
        translateY: withTiming(active.value ? -1 : 0, {
          duration: MOBILE_MOTION_TIMINGS.fast,
        }),
      },
    ],
  }));

  return (
    <MotionPressable
      {...props}
      accessibilityState={accessibilityState}
      accessibilityRole="button"
      style={[style, styles.button]}
    >
      <AnimatedView style={[styles.inner, animatedStyle]}>
        {children}
      </AnimatedView>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    overflow: "hidden",
    borderRadius: 18,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
});
