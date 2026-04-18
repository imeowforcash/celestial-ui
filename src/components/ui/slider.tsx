import * as React from "react"
import { cn } from "@/utils/ui"
import styles from "./Slider.module.css"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getPrecision(...values: number[]) {
  return values.reduce((maxPrecision, value) => {
    const valueText = `${value}`
    const dot = valueText.indexOf(".")
    const precision = dot === -1 ? 0 : valueText.length - dot - 1
    return Math.max(maxPrecision, precision)
  }, 0)
}

function snap(value: number, min: number, max: number, step: number) {
  const precision = getPrecision(min, max, step)
  const stepped = Math.round((value - min) / step) * step + min
  return Number(clamp(stepped, min, max).toFixed(precision))
}

export interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "value" | "onChange"> {
  value?: number[]
  min?: number
  max?: number
  step?: number
  onValueChange?: (value: number[]) => void
  disabled?: boolean
}

const Slider = React.memo(React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      id,
      value,
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      disabled = false,
      ...props
    },
    ref
  ) => {
    const rootRef = React.useRef<HTMLDivElement>(null)
    const thumbRef = React.useRef<HTMLButtonElement>(null)
    const [dragValue, setDragValue] = React.useState<number | null>(null)
    const [dragging, setDragging] = React.useState(false)
    const lastEmittedRef = React.useRef<number | null>(null)

    React.useImperativeHandle(ref, () => rootRef.current as HTMLDivElement)

    let currentValue = min
    if (value && value.length > 0) {
      currentValue = value[0]
    }

    const snappedValue = snap(currentValue, min, max, step)
    const shownValue = dragValue ?? snappedValue

    const getPercent = React.useCallback((item: number) => {
      if (max === min) {
        return 0
      }
      return ((item - min) / (max - min)) * 100
    }, [max, min])

    const emitValueChange = React.useCallback((next: number) => {
      const snapped = snap(next, min, max, step)
      if (lastEmittedRef.current !== snapped) {
        lastEmittedRef.current = snapped
        if (onValueChange) {
          onValueChange([snapped])
        }
      }
      return snapped
    }, [max, min, onValueChange, step])

    React.useEffect(() => {
      lastEmittedRef.current = snappedValue
    }, [snappedValue])

    const getValueFromPointer = React.useCallback((clientX: number) => {
      const node = rootRef.current
      if (!node) {
        return min
      }
      const rect = node.getBoundingClientRect()
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      return min + ratio * (max - min)
    }, [max, min])

    React.useEffect(() => {
      if (!dragging || disabled) {
        return
      }

      const handlePointerMove = (event: PointerEvent) => {
        const snapped = snap(getValueFromPointer(event.clientX), min, max, step)
        setDragValue(snapped)
        emitValueChange(snapped)
      }

      const handlePointerUp = (event: PointerEvent) => {
        const snapped = snap(getValueFromPointer(event.clientX), min, max, step)
        emitValueChange(snapped)
        setDragValue(snapped)
        setDragging(false)
        window.requestAnimationFrame(() => {
          setDragValue(null)
        })
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)

      return () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
      }
    }, [disabled, dragging, emitValueChange, getValueFromPointer])

    const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
      if (disabled) {
        return
      }
      const snapped = snap(getValueFromPointer(event.clientX), min, max, step)
      setDragValue(snapped)
      setDragging(true)
      emitValueChange(snapped)
      if (thumbRef.current) {
        thumbRef.current.focus()
      }
    }

    const handleThumbPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      beginDrag(event)
    }

    const handleThumbKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) {
        return
      }

      let next = snappedValue
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        next = snappedValue + step
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        next = snappedValue - step
      } else if (event.key === "Home") {
        next = min
      } else if (event.key === "End") {
        next = max
      } else if (event.key === "PageUp") {
        next = snappedValue + step * 10
      } else if (event.key === "PageDown") {
        next = snappedValue - step * 10
      } else {
        return
      }

      event.preventDefault()
      emitValueChange(next)
    }

    const percent = getPercent(shownValue)

    return (
      <div
        id={id}
        ref={rootRef}
        className={cn(styles.root, disabled && styles.disabled, className)}
        onPointerDown={beginDrag}
        {...props}
      >
        <div className={styles.track}>
          <div className={styles.range} style={{ width: `${percent}%` }} />
        </div>
        <button
          ref={thumbRef}
          type="button"
          className={styles.thumb}
          style={{ left: `${percent}%` }}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={snappedValue}
          disabled={disabled}
          onPointerDown={handleThumbPointerDown}
          onKeyDown={handleThumbKeyDown}
        />
      </div>
    )
  }
))
Slider.displayName = "Slider"

export { Slider }
