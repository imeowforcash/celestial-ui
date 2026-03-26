import { Toaster as Sonner, type ToasterProps } from "sonner"
import styles from "./Toaster.module.css"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="group"
      style={
        {
          "--toast-enter": "0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          "--toast-exit": "0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          "--toast-move": "0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          "--normal-bg": "var(--bg-panel)",
          "--normal-text": "var(--text-primary)",
          "--normal-border": "var(--border-secondary)",
          "--border-radius": "1rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: styles.toast,
          description: styles.description,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
