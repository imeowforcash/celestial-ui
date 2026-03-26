import * as React from "react"
import { cn } from "@/utils/ui"
import styles from "./UiPrimitives.module.css"

export interface CheckboxProps {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (e: { target: { checked: boolean } }) => void;
  disabled?: boolean;
  className?: string;
}

const Checkbox = React.memo(React.forwardRef<HTMLDivElement, CheckboxProps>(
  ({ id, checked: controlledChecked, defaultChecked, onChange, disabled, className }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked || false);
    
    const isChecked = controlledChecked !== undefined ? controlledChecked : internalChecked;

    const handleClick = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      
      if (disabled) return;
      
      const newChecked = !isChecked;
      setInternalChecked(newChecked);
      onChange?.({ target: { checked: newChecked } });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (disabled) return;
        
        const newChecked = !isChecked;
        setInternalChecked(newChecked);
        onChange?.({ target: { checked: newChecked } });
      }
    };

    return (
      <div 
        ref={ref}
        id={id}
        role="checkbox"
        aria-checked={isChecked}
        tabIndex={disabled ? -1 : 0}
        className={cn(styles["ui-checkbox-wrapper"], className)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className={cn(styles["ui-checkbox"], isChecked && styles.checked, disabled && styles.disabled)} />
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="14" 
          height="14" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className={cn(styles["ui-checkbox-icon"], isChecked && styles.checked)}
        >
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </div>
    )
  }
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
