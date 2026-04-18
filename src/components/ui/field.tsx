import * as React from "react"
import { cn } from "@/utils/ui"
import styles from "./Field.module.css"

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical"
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, orientation = "vertical", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(styles["ui-field"], styles[`ui-field-${orientation}`], className)}
        {...props}
      />
    )
  }
)
Field.displayName = "Field"

export const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn(styles["ui-field-description"], className)}
        {...props}
      />
    )
  }
)
FieldDescription.displayName = "FieldDescription"

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, htmlFor, ...props }, ref) => {
    return (
      <label
        ref={ref}
        htmlFor={htmlFor}
        className={cn(styles["ui-field-label"], className)}
        {...props}
      />
    )
  }
)
FieldLabel.displayName = "FieldLabel"
