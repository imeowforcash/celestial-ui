import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/utils/ui"

import { toast } from "sonner"

const kbdVariants = cva(
  "pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border px-2 font-mono text-[11px] font-medium opacity-100 cursor-pointer pointer-events-auto",
  {
    variants: {
      variant: {
        default: "bg-[var(--bg-secondary)] border-[var(--border-secondary)] text-[var(--text-secondary)]",
        outline: "bg-transparent border-[var(--border-secondary)] text-[var(--text-secondary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface KbdProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof kbdVariants> {}

const Kbd = React.forwardRef<HTMLButtonElement, KbdProps>(
  ({ className, variant, onClick, ...props }, ref) => {
    return (
      <button
        type="button"
        className={cn(kbdVariants({ variant, className }))}
        ref={ref}
        onClick={(e) => {
          toast("No, you can't change these.", {
            duration: 2000,
          });
          if (onClick) onClick(e);
        }}
        {...props}
      />
    )
  }
)
Kbd.displayName = "Kbd"

export { Kbd }
