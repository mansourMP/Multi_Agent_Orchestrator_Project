Dock Two (21st.dev Pattern)

Source snippet:

```tsx
import { Dock } from "@/components/ui/dock-two"
import {
  Home,
  Search,
  Music,
  Heart,
  Settings,
  Plus,
  User
} from "lucide-react"

function DockDemo() {
  const items = [
    { icon: Home, label: "Home" },
    { icon: Search, label: "Search" },
    { icon: Music, label: "Music" },
    { icon: Heart, label: "Favorites" },
    { icon: Plus, label: "Add New" },
    { icon: User, label: "Profile" },
    { icon: Settings, label: "Settings" }
  ]

  return <Dock items={items} />
}

export  { DockDemo }
```

```tsx
import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface DockProps {
  className?: string
  items: {
    icon: LucideIcon
    label: string
    onClick?: () => void
  }[]
}

interface DockIconButtonProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  className?: string
}

const floatingAnimation = {
  initial: { y: 0 },
  animate: {
    y: [-2, 2, -2],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
}

const DockIconButton = React.forwardRef<HTMLButtonElement, DockIconButtonProps>(
  ({ icon: Icon, label, onClick, className }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.1, y: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className={cn(
          "relative group p-3 rounded-lg",
          "hover:bg-secondary transition-colors",
          className
        )}
      >
        <Icon className="w-5 h-5 text-foreground" />
        <span className={cn(
          "absolute -top-8 left-1/2 -translate-x-1/2",
          "px-2 py-1 rounded text-xs",
          "bg-popover text-popover-foreground",
          "opacity-0 group-hover:opacity-100",
          "transition-opacity whitespace-nowrap pointer-events-none"
        )}>
          {label}
        </span>
      </motion.button>
    )
  }
)
DockIconButton.displayName = "DockIconButton"

const Dock = React.forwardRef<HTMLDivElement, DockProps>(
  ({ items, className }, ref) => {
    return (
      <div ref={ref} className={cn("w-full h-64 flex items-center justify-center p-2", className)}>
        <div className="w-full max-w-4xl h-64 rounded-2xl flex items-center justify-center relative">
          <motion.div
            initial="initial"
            animate="animate"
            variants={floatingAnimation}
            className={cn(
              "flex items-center gap-1 p-2 rounded-2xl",
              "backdrop-blur-lg border shadow-lg",
              "bg-background/90 border-border",
              "hover:shadow-xl transition-shadow duration-300"
            )}
          >
            {items.map((item) => (
              <DockIconButton key={item.label} {...item} />
            ))}
          </motion.div>
        </div>
      </div>
    )
  }
)
Dock.displayName = "Dock"

export { Dock }
```

Usage notes for Empyralis:

- Treat as reference only; do not import directly into runtime yet.
- Keep interaction style but rewrite with existing Empyralis primitives (`AppButton`, `Motion*`) and tokenized classes.
- If reused for mobile tabs, avoid `framer-motion` on heavy navigation shells unless perf budget is validated.
- Prefer simplified dock for 4-6 primary destinations only.
- Keep labels visible in compact chip mode for low-confusion discoverability.
