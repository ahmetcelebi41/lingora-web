"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  invalidateTranslationRequest,
  runTranslation,
  type TranslationRequestTracker,
} from "@/features/translation/flow";
import { translationService } from "@/features/translation/service";
import styles from "./translator.module.css";

export function Translator() {
  const [state, setState] = useState(initialTranslationState);
  const request = useRef<TranslationRequestTracker>({ id: 0, pending: false });
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "error">("idle");
  const copy = useRef<{ id: number; timer: ReturnType<typeof setTimeout> | null }>({
    id: 0,
    timer: null,
  });

  useEffect(() => {
    const tracker = request.current;
    const copyTracker = copy.current;
    return () => {
      invalidateTranslationRequest(tracker);
      copyTracker.id += 1;
      if (copyTracker.timer !== null) clearTimeout(copyTracker.timer);
    };
  }, []);

  const {
    sourceText,
    resultText,
    sourceLanguage,
    targetLanguage,
    status,
    phase,
    error,
  } = state;
  const hasSourceText = sourceText.trim().length > 0;
  const hasResult = resultText.trim().length > 0;
  const isLoading = status === "loading";
  const loadingMessage = phase === "preparing"
    ? "Model hazırlanıyor… İlk kullanım biraz sürebilir."
    : "Çevriliyor…";
  const canTranslate =
    hasSourceText &&
    sourceLanguage !== targetLanguage &&
    !isLoading;

  function handleTranslate() {
    resetCopyFeedback();
    void runTranslation(state, request.current, translationService, setState);
  }

  function resetCopyFeedback() {
    const tracker = copy.current;
    tracker.id += 1;
    if (tracker.timer !== null) clearTimeout(tracker.timer);
    tracker.timer = null;
    setCopyFeedback("idle");
  }

  async function handleCopy() {
    if (!hasResult || isLoading) return;
    resetCopyFeedback();
    const tracker = copy.current;
    const id = tracker.id;
    try {
      await navigator.clipboard.writeText(resultText);
      if (tracker.id !== id) return;
      setCopyFeedback("copied");
      tracker.timer = setTimeout(() => {
        if (tracker.id !== id) return;
        tracker.timer = null;
        setCopyFeedback("idle");
      }, 1800);
    } catch {
      // Unavailable/denied clipboard access is separate from translation errors.
      if (tracker.id === id) setCopyFeedback("error");
    }
  }

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
          disabled={isLoading}
          onChange={(event) => {
            const value = event.currentTarget.value;
            resetCopyFeedback();
            invalidateTranslationRequest(request.current);
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
            resetCopyFeedback();
            invalidateTranslationRequest(request.current);
            setState((previous) => changeSourceText(previous, value));
          }}
          rows={8}
          className={styles.textarea}
        />
        <div className={styles.actions}>
          <Button
            variant="ghost"
            disabled={isLoading || sourceText.length === 0}
            onClick={() => {
              resetCopyFeedback();
              invalidateTranslationRequest(request.current);
              setState(clearTranslation);
            }}
          >
            Temizle
          </Button>
        </div>
      </section>

      <div className={styles.swap}>
        <IconButton
          aria-label="Dilleri değiştir"
          variant="secondary"
          disabled={isLoading}
          onClick={() => {
            resetCopyFeedback();
            invalidateTranslationRequest(request.current);
            setState(swapLanguages);
          }}
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
          disabled={isLoading}
          onChange={(event) => {
            const value = event.currentTarget.value;
            resetCopyFeedback();
            invalidateTranslationRequest(request.current);
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
          <Button
            variant="ghost"
            disabled={!hasResult || isLoading}
            onClick={() => void handleCopy()}
          >
            {copyFeedback === "copied" ? "Kopyalandı" : "Kopyala"}
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
          loading={isLoading}
          loadingText={loadingMessage}
          onClick={handleTranslate}
        >
          Çevir
        </Button>
      </div>

      {isLoading && (
        <div className={styles.feedback}>
          <StatusMessage variant="info" role="status">
            {loadingMessage}
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
      {copyFeedback === "error" && (
        <div className={styles.feedback}>
          <StatusMessage variant="error" role="alert">
            Çeviri kopyalanamadı. Tekrar deneyin.
          </StatusMessage>
        </div>
      )}
    </>
  );
}
