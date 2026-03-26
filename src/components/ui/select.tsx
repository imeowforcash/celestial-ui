import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import { cn } from "@/utils/ui"
import styles from "./Select.module.css"

const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
)

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
)

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  id?: string
  disabled?: boolean
}

const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Select...",
  id,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function closeDropdown() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
    setIsOpen(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }
    
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDropdown()
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  const selectedOption = options.find((opt) => opt.value === value)

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    closeDropdown()
  }

  const toggleDropdown = () => {
    if (disabled) return

    if (isOpen) {
      closeDropdown()
    } else {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
      setIsOpen(true)
    }
  }

  return (
    <div 
      ref={containerRef} 
      className={styles.wrap}
    >
        <LazyMotion features={domAnimation}>
          <button
            type="button"
            id={id}
            className={cn(styles.trigger, disabled && styles.disabled)}
            onClick={toggleDropdown}
            disabled={disabled}
          >
            <span className={cn(styles.text, !selectedOption && styles.placeholder)}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <span className={styles.icon}>
              <m.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <ChevronDownIcon />
              </m.div>
            </span>
          </button>

          <AnimatePresence>
            {isOpen && (
              <m.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className={styles.menu}
              >
                {options.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={cn(styles.opt, value === option.value && styles.selected)}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span>{option.label}</span>
                    <span className={styles.check}>
                      <CheckIcon />
                    </span>
                  </button>
                ))}
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
    </div>
  )
}

export { Select }
