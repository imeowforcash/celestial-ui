import * as React from "react"
import { cn } from "@/utils/ui"

const ButtonGroupContext = React.createContext<{
  orientation: "horizontal" | "vertical"
}>({
  orientation: "horizontal",
})

const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "horizontal" | "vertical"
  }
>(({ className, orientation = "horizontal", ...props }, ref) => {
  return (
    <ButtonGroupContext.Provider value={{ orientation }}>
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
    </ButtonGroupContext.Provider>
  )
})
ButtonGroup.displayName = "ButtonGroup"

const ButtonGroupSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { orientation } = React.useContext(ButtonGroupContext)
  return (
    <div
      ref={ref}
      className={cn(
        "bg-[var(--border-secondary)] z-10",
        orientation === "horizontal" ? "w-px h-auto my-1" : "h-px w-auto mx-1",
        className
      )}
      {...props}
    />
  )
})
ButtonGroupSeparator.displayName = "ButtonGroupSeparator"

const ButtonGroupText = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center px-3 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-input)] border border-[var(--border-secondary)]",
        className
      )}
      {...props}
    />
  )
})
ButtonGroupText.displayName = "ButtonGroupText"

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText }
