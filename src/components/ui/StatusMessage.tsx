import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./status-message.module.css";

export type StatusMessageProps = ComponentPropsWithoutRef<"div"> & {
  variant?: "info" | "success" | "warning" | "error";
  children: ReactNode;
};

const labels = {
  info: "Bilgi",
  success: "Başarılı",
  warning: "Uyarı",
  error: "Hata",
};

export function StatusMessage({
  variant = "info",
  className,
  children,
  ...props
}: StatusMessageProps) {
  return (
    <div
      {...props}
      className={[styles.status, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      <strong>{labels[variant]}:</strong>
      <div>{children}</div>
    </div>
  );
}
