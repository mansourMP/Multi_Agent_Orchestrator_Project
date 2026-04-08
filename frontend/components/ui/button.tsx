"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import type { CSSProperties } from "react"

import { DESIGN_TOKENS, buttonStyle, mergeStyles, type ButtonSize, type ButtonTone } from "@/design-constraints"
import { cn } from "@/lib/utils"

const BUTTON_BASE_CLASSNAME =
  "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0"

function Button({
  className,
  variant = "default",
  size = "default",
  style,
  ...props
}: ButtonPrimitive.Props & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  style?: CSSProperties;
}) {
  const tone: ButtonTone =
    variant === "default"
      ? "primary"
      : variant === "secondary" || variant === "outline"
        ? "secondary"
        : variant === "ghost" || variant === "link"
          ? "ghost"
          : "danger";
  const resolvedSize: ButtonSize =
    size === "xs" || size === "sm"
      ? "sm"
      : size === "lg"
        ? "lg"
        : size === "icon" || size === "icon-sm" || size === "icon-xs"
          ? "icon-sm"
          : size === "icon-lg"
            ? "icon-md"
            : "md";
  const linkStyle: CSSProperties | undefined =
    variant === "link"
      ? {
          background: "transparent",
          border: "1px solid transparent",
          color: DESIGN_TOKENS.color.accent,
          height: "auto",
          minWidth: 0,
          paddingInline: 0,
          borderRadius: 0,
        }
      : undefined;
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(BUTTON_BASE_CLASSNAME, className)}
      style={mergeStyles(
        {
          gap: DESIGN_TOKENS.space[2],
          fontFamily: DESIGN_TOKENS.type.family,
        },
        buttonStyle({ tone, size: resolvedSize, disabled: Boolean(props.disabled) }),
        linkStyle,
        style,
      )}
      {...props}
    />
  )
}

export { Button }
