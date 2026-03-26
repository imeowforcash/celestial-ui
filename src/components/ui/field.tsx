import * as React from "react"
import { cn } from "@/utils/ui"
import styles from "./UiPrimitives.module.css"

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

export const FieldContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(styles["ui-field-content"], className)}
        {...props}
      />
    )
  }
)
FieldContent.displayName = "FieldContent"

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

export const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(styles["ui-field-group"], className)}
        {...props}
      />
    )
  }
)
FieldGroup.displayName = "FieldGroup"

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

export interface FieldLegendProps extends React.HTMLAttributes<HTMLLegendElement> {
  variant?: "label" | "default"
}

export const FieldLegend = React.forwardRef<HTMLLegendElement, FieldLegendProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <legend
        ref={ref}
        className={cn(styles["ui-field-legend"], variant === "label" && styles["ui-field-legend-label"], className)}
        {...props}
      />
    )
  }
)
FieldLegend.displayName = "FieldLegend"

export const FieldSeparator = React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => {
    return (
      <hr
        ref={ref}
        className={cn(styles["ui-field-separator"], className)}
        {...props}
      />
    )
  }
)
FieldSeparator.displayName = "FieldSeparator"

export const FieldSet = React.forwardRef<HTMLFieldSetElement, React.FieldsetHTMLAttributes<HTMLFieldSetElement>>(
  ({ className, ...props }, ref) => {
    return (
      <fieldset
        ref={ref}
        className={cn(styles["ui-field-set"], className)}
        {...props}
      />
    )
  }
)
FieldSet.displayName = "FieldSet"
