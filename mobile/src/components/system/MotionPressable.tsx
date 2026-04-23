import type { PropsWithChildren } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { MOBILE_MOTION_TIMINGS, MOBILE_SPRING_PRESETS } from "@/src/ui/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionPressable({
  children,
  style,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: PropsWithChildren<PressableProps & {
  style?: StyleProp<ViewStyle>;
}>) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: disabled
      ? 0.58
      : withTiming(pressed.value ? 0.94 : 1, {
          duration: MOBILE_MOTION_TIMINGS.fast,
        }),
    transform: [
      {
        scale: withSpring(pressed.value ? 0.976 : 1, MOBILE_SPRING_PRESETS.press),
      },
      {
        translateY: withTiming(pressed.value ? 1 : 0, {
          duration: MOBILE_MOTION_TIMINGS.fast,
        }),
      },
    ],
  }));

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) {
          pressed.value = 1;
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = 0;
        onPressOut?.(event);
      }}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
