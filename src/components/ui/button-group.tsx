import * as React from "react"
import { cn } from "@/utils/ui"

const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "horizontal" | "vertical"
  }
>(({ className, orientation = "horizontal", ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="group"
      className={cn(
        "inline-flex",
        orientation === "horizontal"
          ? "flex-row -space-x-px [&>*:not(:first-child):not(:last-child)]:rounded-none [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none"
          : "flex-col -space-y-px [&>*:not(:first-child):not(:last-child)]:rounded-none [&>*:first-child]:rounded-b-none [&>*:last-child]:rounded-t-none",
        className
      )}
      {...props}
    />
  )
})
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }
