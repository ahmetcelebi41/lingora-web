import type { ReactNode } from "react";
import styles from "./field.module.css";

export type FieldProps = {
  id: string;
  label: string;
  helperText?: string;
  errorText?: string;
  children: ReactNode;
};

export function getFieldDescription(
  id: string,
  helperText?: string,
  errorText?: string,
  describedBy?: string,
) {
  return (
    [
      describedBy,
      helperText?.trim() ? `${id}-helper` : undefined,
      errorText?.trim() ? `${id}-error` : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

export function Field({
  id,
  label,
  helperText,
  errorText,
  children,
}: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {helperText?.trim() && (
        <p id={`${id}-helper`} className={styles.helper}>
          {helperText}
        </p>
      )}
      {errorText?.trim() && (
        <p id={`${id}-error`} className={styles.error}>
          Hata: {errorText}
        </p>
      )}
    </div>
  );
}
