"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { DESIGN_TOKENS, bodyTextStyle, mergeStyles, modalOverlayStyle, panelStyle, sectionTitleStyle } from "@/design-constraints"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(className)}
      style={modalOverlayStyle()}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(className)}
        style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[5] }), {
          position: "fixed",
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
          gap: DESIGN_TOKENS.space[4],
          left: side === "left" ? 0 : side === "right" ? undefined : 0,
          right: side === "right" ? 0 : side === "left" ? undefined : 0,
          top: side === "top" ? 0 : side === "bottom" ? undefined : 0,
          bottom: side === "bottom" ? 0 : side === "top" ? undefined : 0,
          width: side === "left" || side === "right" ? "min(420px, 82vw)" : "100%",
          height: side === "left" || side === "right" ? "100%" : "auto",
          maxHeight: side === "top" || side === "bottom" ? "85vh" : undefined,
        } as React.CSSProperties)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(className)}
      style={{ display: "grid", gap: DESIGN_TOKENS.space[2] }}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(className)}
      style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: DESIGN_TOKENS.space[3] }}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(className)}
      style={sectionTitleStyle()}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn(className)}
      style={bodyTextStyle()}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
