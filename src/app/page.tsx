import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={`container ${styles.page}`}>
      <h1>LINGORA</h1>
      <p className={styles.description}>
        İngilizce ve Türkçe arasında hızlı ve anlaşılır çeviri.
      </p>
    </main>
  );
}
