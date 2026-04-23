import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from "react-native-reanimated";

import { MOBILE_MOTION_TIMINGS, MOBILE_SPRING_PRESETS } from "@/src/ui/motion";

export function MotionBanner({
  children,
  style,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Animated.View
      entering={FadeInDown.duration(MOBILE_MOTION_TIMINGS.normal)}
      exiting={FadeOutUp.duration(MOBILE_MOTION_TIMINGS.fast)}
      layout={LinearTransition.springify()
        .mass(MOBILE_SPRING_PRESETS.banner.mass)
        .stiffness(MOBILE_SPRING_PRESETS.banner.stiffness)
        .damping(MOBILE_SPRING_PRESETS.banner.damping)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
