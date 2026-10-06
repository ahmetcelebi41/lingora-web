import {
  Button,
  IconButton,
  Select,
  StatusMessage,
  Textarea,
  type StatusMessageProps,
} from "@/components/ui";
import styles from "./translator.module.css";

export type TranslatorProps = {
  statusMessage?: StatusMessageProps;
};

export function Translator({ statusMessage }: TranslatorProps) {
  return (
    <>
      <section
        className={`${styles.panel} ${styles.source}`}
        aria-labelledby="source-heading"
      >
        <h2 id="source-heading">Kaynak</h2>
        <Select
          id="source-language"
          name="sourceLanguage"
          label="Kaynak dil"
          defaultValue="en"
        >
          <option value="en">İngilizce</option>
          <option value="tr">Türkçe</option>
        </Select>
        <Textarea
          id="source-text"
          name="sourceText"
          label="İngilizce metin"
          placeholder="Çevirmek istediğiniz metni yazın"
          rows={8}
          className={styles.textarea}
        />
        <div className={styles.actions}>
          <Button variant="ghost" disabled>
            Temizle
          </Button>
        </div>
      </section>

      <div className={styles.swap}>
        <IconButton aria-label="Dilleri değiştir" variant="secondary" disabled>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />
          </svg>
        </IconButton>
      </div>

      <section
        className={`${styles.panel} ${styles.result}`}
        aria-labelledby="result-heading"
      >
        <h2 id="result-heading">Sonuç</h2>
        <Select
          id="target-language"
          name="targetLanguage"
          label="Hedef dil"
          defaultValue="tr"
        >
          <option value="en">İngilizce</option>
          <option value="tr">Türkçe</option>
        </Select>
        <Textarea
          id="result-text"
          name="resultText"
          label="Türkçe çeviri"
          placeholder="Çeviri burada görünecek"
          defaultValue=""
          rows={8}
          readOnly
          className={styles.textarea}
        />
        <div className={styles.actions}>
          <Button variant="ghost" disabled>
            Kopyala
          </Button>
          <Button variant="ghost" disabled>
            Dinle
          </Button>
          <Button variant="ghost" disabled>
            Durdur
          </Button>
        </div>
      </section>

      <div className={styles.footer}>
        <Button variant="primary" className={styles.translate} disabled>
          Çevir
        </Button>
      </div>

      {statusMessage && (
        <div className={styles.feedback}>
          <StatusMessage {...statusMessage} />
        </div>
      )}
    </>
  );
}
