import { Easing } from "react-native-reanimated";

import { DESIGN_SYSTEM_MOTION } from "@shared/design-system/tokens";

export const MOBILE_MOTION_TIMINGS = DESIGN_SYSTEM_MOTION;

export const MOBILE_MOTION_EASING = {
  standard: Easing.bezier(0.22, 1, 0.36, 1),
  emphasized: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

export const MOBILE_SPRING_PRESETS = {
  press: {
    mass: 0.82,
    stiffness: 420,
    damping: 28,
    overshootClamping: false,
  },
  row: {
    mass: 0.9,
    stiffness: 340,
    damping: 28,
    overshootClamping: false,
  },
  banner: {
    mass: 0.92,
    stiffness: 300,
    damping: 26,
    overshootClamping: false,
  },
  sheet: {
    mass: 1,
    stiffness: 280,
    damping: 28,
    overshootClamping: false,
  },
} as const;

export const MOBILE_STACK_MOTION_PRESETS = {
  forwardCard: {
    animation: "slide_from_right",
    presentation: "card",
  },
  backwardCard: {
    animation: "slide_from_left",
    presentation: "card",
  },
  sheet: {
    presentation: "transparentModal",
    animation: "slide_from_bottom",
    animationDuration: DESIGN_SYSTEM_MOTION.slow,
  },
} as const;

export const MOBILE_BOTTOM_SHEET_SNAP_POINTS = {
  compact: ["42%"],
  medium: ["58%"],
  roomy: ["72%"],
} as const;
