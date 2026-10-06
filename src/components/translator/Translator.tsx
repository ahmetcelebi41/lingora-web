"use client";

import { useState } from "react";
import {
  Button,
  IconButton,
  Select,
  StatusMessage,
  Textarea,
} from "@/components/ui";
import {
  changeLanguage,
  changeSourceText,
  clearTranslation,
  initialTranslationState,
  swapLanguages,
} from "@/features/translation/state";
import styles from "./translator.module.css";

// Enable only when a real translation service is connected.
const isTranslationAvailable = false;

export function Translator() {
  const [state, setState] = useState(initialTranslationState);
  const {
    sourceText,
    resultText,
    sourceLanguage,
    targetLanguage,
    status,
    error,
  } = state;
  const hasSourceText = sourceText.trim().length > 0;
  const hasResult = resultText.trim().length > 0;
  const isLoading = status === "loading";
  const canTranslate =
    isTranslationAvailable &&
    hasSourceText &&
    sourceLanguage !== targetLanguage &&
    !isLoading;

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
          value={sourceLanguage}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setState((previous) =>
              changeLanguage(previous, "sourceLanguage", value),
            );
          }}
        >
          <option value="en">İngilizce</option>
          <option value="tr">Türkçe</option>
        </Select>
        <Textarea
          id="source-text"
          name="sourceText"
          label={sourceLanguage === "en" ? "İngilizce metin" : "Türkçe metin"}
          placeholder="Çevirmek istediğiniz metni yazın"
          value={sourceText}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setState((previous) => changeSourceText(previous, value));
          }}
          rows={8}
          className={styles.textarea}
        />
        <div className={styles.actions}>
          <Button
            variant="ghost"
            disabled={sourceText.length === 0}
            onClick={() => setState(clearTranslation)}
          >
            Temizle
          </Button>
        </div>
      </section>

      <div className={styles.swap}>
        <IconButton
          aria-label="Dilleri değiştir"
          variant="secondary"
          onClick={() => setState(swapLanguages)}
        >
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
          value={targetLanguage}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setState((previous) =>
              changeLanguage(previous, "targetLanguage", value),
            );
          }}
        >
          <option value="en">İngilizce</option>
          <option value="tr">Türkçe</option>
        </Select>
        <Textarea
          id="result-text"
          name="resultText"
          label={targetLanguage === "en" ? "İngilizce çeviri" : "Türkçe çeviri"}
          placeholder={hasResult ? undefined : "Çeviri burada görünecek"}
          value={resultText}
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
        <Button
          variant="primary"
          className={styles.translate}
          disabled={!canTranslate}
        >
          Çevir
        </Button>
      </div>

      {isLoading && (
        <div className={styles.feedback}>
          <StatusMessage variant="info" role="status">
            Çevriliyor…
          </StatusMessage>
        </div>
      )}
      {status === "error" && error && (
        <div className={styles.feedback}>
          <StatusMessage variant="error" role="alert">
            {error}
          </StatusMessage>
        </div>
      )}
    </>
  );
}
