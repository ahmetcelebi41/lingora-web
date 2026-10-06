import { AppShell } from "@/components/layout/AppShell";
import styles from "./page.module.css";

export default function Home() {
  return (
    <AppShell>
      <div className={styles.intro}>
        <h1>LINGORA</h1>
        <p className={styles.description}>
          İngilizce ve Türkçe arasında hızlı ve anlaşılır çeviri.
        </p>
      </div>
    </AppShell>
  );
}
