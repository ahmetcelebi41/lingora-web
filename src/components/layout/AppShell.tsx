import type { ReactNode } from "react";
import { Header } from "./Header";
import styles from "./app-shell.module.css";

export type AppShellProps = {
  children: ReactNode;
  workspace?: ReactNode;
};

export function AppShell({ children, workspace }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={`container ${styles.main}`}>
        {children}
        {workspace != null && (
          <div className={styles.workspace}>{workspace}</div>
        )}
      </main>
    </div>
  );
}
