import styles from "./header.module.css";

export function Header() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <span className={styles.wordmark}>LINGORA</span>
      </div>
    </header>
  );
}
