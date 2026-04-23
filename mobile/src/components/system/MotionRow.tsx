import type { PropsWithChildren } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { MOBILE_SPRING_PRESETS } from "@/src/ui/motion";

import { MotionPressable } from "./MotionPressable";

export function MotionRow({
  children,
  onPress,
  style,
  ...props
}: PropsWithChildren<PressableProps & {
  style?: StyleProp<ViewStyle>;
}>) {
  if (onPress) {
    return (
      <MotionPressable {...props} onPress={onPress} style={style}>
        {children}
      </MotionPressable>
    );
  }

  return (
    <Animated.View
      layout={LinearTransition.springify()
        .mass(MOBILE_SPRING_PRESETS.row.mass)
        .stiffness(MOBILE_SPRING_PRESETS.row.stiffness)
        .damping(MOBILE_SPRING_PRESETS.row.damping)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
