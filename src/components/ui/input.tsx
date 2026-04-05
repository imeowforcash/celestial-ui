import * as React from "react"
import { cn } from "@/utils/ui"
import styles from "./Input.module.css"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.memo(React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(styles["ui-input"], className)}
        ref={ref}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        {...props}
      />
    )
  }
))
Input.displayName = "Input"

export { Input }
