import type { ComponentPropsWithoutRef } from "react";
import { Field, getFieldDescription, type FieldProps } from "./Field";
import styles from "./field.module.css";

export type SelectProps = Omit<ComponentPropsWithoutRef<"select">, "id"> &
  Omit<FieldProps, "children">;

export function Select({
  id,
  label,
  helperText,
  errorText,
  className,
  children,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: SelectProps) {
  return (
    <Field id={id} label={label} helperText={helperText} errorText={errorText}>
      <select
        {...props}
        id={id}
        aria-describedby={getFieldDescription(
          id,
          helperText,
          errorText,
          describedBy,
        )}
        aria-invalid={errorText?.trim() ? true : ariaInvalid}
        className={[styles.control, className].filter(Boolean).join(" ")}
      >
        {children}
      </select>
    </Field>
  );
}
