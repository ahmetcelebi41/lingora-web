import { Button, type ButtonProps } from "./Button";
import styles from "./icon-button.module.css";

export type IconButtonProps = Omit<
  ButtonProps,
  "aria-label" | "loading" | "loadingText"
> & {
  "aria-label": string;
};

export function IconButton({
  variant = "ghost",
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      variant={variant}
      aria-label={ariaLabel}
      className={[styles.iconButton, className].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true" className={styles.icon}>
        {children}
      </span>
    </Button>
  );
}
