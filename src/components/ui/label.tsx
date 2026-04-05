import * as React from "react"
import { cn } from "@/utils/ui"
import styles from "./Label.module.css"

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, htmlFor, ...props }, ref) => {
    return (
      <label
        ref={ref}
        htmlFor={htmlFor}
        className={cn(styles["ui-label"], className)}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
