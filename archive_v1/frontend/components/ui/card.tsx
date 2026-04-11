import * as React from "react"

import { DESIGN_TOKENS, bodyTextStyle, mergeStyles, panelStyle, sectionTitleStyle } from "@/design-constraints"
import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  style,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col overflow-hidden",
        className
      )}
      style={mergeStyles(
        panelStyle({ padding: size === "sm" ? DESIGN_TOKENS.space[5] : DESIGN_TOKENS.space[6] }),
        {
          gap: size === "sm" ? DESIGN_TOKENS.space[4] : DESIGN_TOKENS.space[5],
        },
        style,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header grid auto-rows-min items-start",
        className
      )}
      style={mergeStyles(
        {
          gap: DESIGN_TOKENS.space[2],
        },
        style,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(className)}
      style={mergeStyles(sectionTitleStyle(), style)}
      {...props}
    />
  )
}

function CardDescription({ className, style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(className)}
      style={mergeStyles(bodyTextStyle(), style)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(className)}
      style={style}
      {...props}
    />
  )
}

function CardFooter({ className, style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center",
        className
      )}
      style={mergeStyles(
        {
          paddingTop: DESIGN_TOKENS.space[4],
          borderTop: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
          background: DESIGN_TOKENS.color.surfaceMuted,
          marginInline: -DESIGN_TOKENS.space[6],
          marginBottom: -DESIGN_TOKENS.space[6],
          paddingInline: DESIGN_TOKENS.space[6],
          paddingBottom: DESIGN_TOKENS.space[6],
        },
        style,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
