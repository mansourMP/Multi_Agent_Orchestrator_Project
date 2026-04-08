import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { badgeStyle, mergeStyles, type BadgeTone } from "@/design-constraints"
import { cn } from "@/lib/utils"

const toneMap: Record<NonNullable<BadgeProps["variant"]>, BadgeTone> = {
  default: "accent",
  secondary: "neutral",
  destructive: "danger",
  outline: "neutral",
  ghost: "neutral",
  link: "accent",
}

type BadgeProps = useRender.ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"
}

function Badge({
  className,
  variant = "default",
  render,
  style,
  ...props
}: BadgeProps) {
  const isLink = variant === "link"
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn("inline-flex items-center whitespace-nowrap", className),
        style: mergeStyles(
          badgeStyle(toneMap[variant]),
          isLink
            ? {
                background: "transparent",
                border: "1px solid transparent",
                paddingInline: 0,
              }
            : undefined,
          style,
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge }
