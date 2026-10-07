"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

const subscribeToSpeechSupport = () => () => {};
const speechSupported = () =>
  typeof window !== "undefined" &&
  typeof window.speechSynthesis?.speak === "function" &&
  typeof window.speechSynthesis?.cancel === "function" &&
  typeof window.SpeechSynthesisUtterance === "function";

type ActiveSpeech = {
  utterance: SpeechSynthesisUtterance | null;
  synthesis: SpeechSynthesis | null;
};

function cancelActiveSpeech(tracker: ActiveSpeech) {
  const { utterance, synthesis } = tracker;
  tracker.utterance = null;
  tracker.synthesis = null;
  if (!utterance) return;
  // Detach before cancel: canceled/interrupted events must not restore feedback.
  utterance.onend = null;
  utterance.onerror = null;
  try {
    synthesis?.cancel();
  } catch {
    // Cleanup must remain safe even if the browser speech engine is unavailable.
  }
}

export function Translator() {
  const [state, setState] = useState(initialTranslationState);
  const request = useRef<TranslationRequestTracker>({ id: 0, pending: false });
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "error">("idle");
  const copy = useRef<{ id: number; timer: ReturnType<typeof setTimeout> | null }>({
    id: 0,
    timer: null,
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const speech = useRef<ActiveSpeech>({ utterance: null, synthesis: null });
  // Server and initial hydration render disabled; browser support enables TTS.
  const supportsSpeech = useSyncExternalStore(
    subscribeToSpeechSupport,
    speechSupported,
    () => false,
  );

  useEffect(() => {
    const tracker = request.current;
    const copyTracker = copy.current;
    const speechTracker = speech.current;
    return () => {
      invalidateTranslationRequest(tracker);
      copyTracker.id += 1;
      if (copyTracker.timer !== null) clearTimeout(copyTracker.timer);
      cancelActiveSpeech(speechTracker);
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
  const englishPanel = sourceLanguage === "en" ? "source"
    : targetLanguage === "en" ? "result" : null;
  const englishText = englishPanel === "source" ? sourceText
    : englishPanel === "result" ? resultText : "";
  const loadingMessage = phase === "preparing"
    ? "Model hazırlanıyor… İlk kullanım biraz sürebilir."
    : "Çevriliyor…";
  const canTranslate =
    hasSourceText &&
    sourceLanguage !== targetLanguage &&
    !isLoading;

  function handleTranslate() {
    stopSpeech();
    resetCopyFeedback();
    void runTranslation(state, request.current, translationService, setState);
  }

  function stopSpeech() {
    cancelActiveSpeech(speech.current);
    setIsSpeaking(false);
    setSpeechError(false);
  }

  function handleListen() {
    if (!supportsSpeech || !englishText.trim() || isLoading || speech.current.utterance) return;
    stopSpeech();
    const tracker = speech.current;
    try {
      const synthesis = window.speechSynthesis;
      synthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(englishText);
      utterance.lang = "en-US";
      tracker.utterance = utterance;
      tracker.synthesis = synthesis;
      utterance.onend = () => {
        if (tracker.utterance !== utterance) return;
        tracker.utterance = null;
        tracker.synthesis = null;
        setIsSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (tracker.utterance !== utterance) return;
        tracker.utterance = null;
        tracker.synthesis = null;
        setIsSpeaking(false);
        setSpeechError(event.error !== "canceled" && event.error !== "interrupted");
      };
      setIsSpeaking(true);
      synthesis.speak(utterance);
    } catch {
      cancelActiveSpeech(tracker);
      setIsSpeaking(false);
      setSpeechError(true);
    }
  }

  const speechControls = (
    <>
      <Button
        variant="ghost"
        disabled={!supportsSpeech || !englishText.trim() || isLoading || isSpeaking}
        onClick={handleListen}
      >
        Dinle
      </Button>
      <Button variant="ghost" disabled={!isSpeaking} onClick={stopSpeech}>
        Durdur
      </Button>
    </>
  );

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
            stopSpeech();
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
            stopSpeech();
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
              stopSpeech();
              resetCopyFeedback();
              invalidateTranslationRequest(request.current);
              setState(clearTranslation);
            }}
          >
            Temizle
          </Button>
          {englishPanel === "source" && speechControls}
        </div>
      </section>

      <div className={styles.swap}>
        <IconButton
          aria-label="Dilleri değiştir"
          variant="secondary"
          disabled={isLoading}
          onClick={() => {
            stopSpeech();
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
            stopSpeech();
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
          {englishPanel === "result" && speechControls}
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
      {speechError && (
        <div className={styles.feedback}>
          <StatusMessage variant="error" role="alert">
            Sesli okuma başlatılamadı. Tekrar deneyin.
          </StatusMessage>
        </div>
      )}
    </>
  );
}
