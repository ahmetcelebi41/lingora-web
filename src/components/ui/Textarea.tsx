import type { ComponentPropsWithoutRef } from "react";
import { Field, getFieldDescription, type FieldProps } from "./Field";
import fieldStyles from "./field.module.css";
import styles from "./textarea.module.css";

export type TextareaProps = Omit<
  ComponentPropsWithoutRef<"textarea">,
  "id" | "children"
> &
  Omit<FieldProps, "children">;

export function Textarea({
  id,
  label,
  helperText,
  errorText,
  rows = 4,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaProps) {
  return (
    <Field id={id} label={label} helperText={helperText} errorText={errorText}>
      <textarea
        {...props}
        id={id}
        rows={rows}
        aria-describedby={getFieldDescription(
          id,
          helperText,
          errorText,
          describedBy,
        )}
        aria-invalid={errorText?.trim() ? true : ariaInvalid}
        className={[fieldStyles.control, styles.textarea, className]
          .filter(Boolean)
          .join(" ")}
      />
    </Field>
  );
}
