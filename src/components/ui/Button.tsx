import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./button.module.css";

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  type = "button",
  disabled = false,
  loading = false,
  loadingText = "Yükleniyor…",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : props["aria-busy"]}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? loadingText : children}
    </button>
  );
}
