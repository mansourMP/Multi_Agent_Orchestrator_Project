import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { DESIGN_TOKENS, inputStyle, mergeStyles } from "@/design-constraints"
import { cn } from "@/lib/utils"

function Input({ className, type, style, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 outline-none disabled:pointer-events-none file:inline-flex file:h-6 file:border-0 file:bg-transparent",
        className
      )}
      style={mergeStyles(
        {
          fontFamily: DESIGN_TOKENS.type.family,
        },
        inputStyle({
          invalid: Boolean(props["aria-invalid"]),
          disabled: Boolean(props.disabled),
        }),
        style,
      )}
      {...props}
    />
  )
}

export { Input }
