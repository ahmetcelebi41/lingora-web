"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { connectTranslationService, translationService } from "@/features/translation/service";
import { discoverEnglishVoices, selectEnglishVoice } from "./speechVoice";
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
  const [englishVoices, setEnglishVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const voicePreference = useRef("");
  const storedVoicePending = useRef(false);

  const refreshVoices = useCallback(() => {
    const voices = discoverEnglishVoices(window.speechSynthesis);
    setEnglishVoices(voices);
    const preferred = voicePreference.current;
    // An initially empty list can be temporary; retain the stored URI until voices arrive.
    if (preferred && !voices.some((voice) => voice.voiceURI === preferred)) {
      if (!storedVoicePending.current || voices.length > 0) {
        voicePreference.current = "";
        storedVoicePending.current = false;
        try { window.localStorage.removeItem("lingora.tts.voice"); } catch { /* Optional storage. */ }
      }
    } else if (voices.length > 0) {
      storedVoicePending.current = false;
    }
    setSelectedVoiceURI(voices.some((voice) => voice.voiceURI === voicePreference.current)
      ? voicePreference.current : "");
    return voices;
  }, []);
  // Server and initial hydration render disabled; browser support enables TTS.
  const supportsSpeech = useSyncExternalStore(
    subscribeToSpeechSupport,
    speechSupported,
    () => false,
  );

  useEffect(() => {
    if (!speechSupported()) return;
    const synthesis = window.speechSynthesis;
    try {
      voicePreference.current = window.localStorage.getItem("lingora.tts.voice") ?? "";
      storedVoicePending.current = Boolean(voicePreference.current);
    } catch { /* Storage can be unavailable or denied. */ }
    let active = true;
    const refresh = () => { if (active) refreshVoices(); };
    refresh();
    synthesis.addEventListener?.("voiceschanged", refresh);
    return () => {
      active = false;
      synthesis.removeEventListener?.("voiceschanged", refresh);
    };
  }, [refreshVoices]);

  useEffect(() => {
    const disconnect = connectTranslationService();
    const tracker = request.current;
    const copyTracker = copy.current;
    const speechTracker = speech.current;
    return () => {
      invalidateTranslationRequest(tracker);
      copyTracker.id += 1;
      if (copyTracker.timer !== null) clearTimeout(copyTracker.timer);
      cancelActiveSpeech(speechTracker);
      disconnect();
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
      // Re-read at each user action, including browsers without voiceschanged.
      const voices = refreshVoices();
      const voice = voices.find((candidate) => candidate.voiceURI === voicePreference.current)
        ?? selectEnglishVoice(voices);
      if (voice) utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
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
      <div className={styles.voiceSelection}>
        <Select
          id="english-voice"
          name="englishVoice"
          label="İngilizce ses"
          value={selectedVoiceURI}
          disabled={!supportsSpeech || englishVoices.length === 0}
          onChange={(event) => {
            stopSpeech();
            const uri = event.currentTarget.value;
            const selected = englishVoices.some((voice) => voice.voiceURI === uri) ? uri : "";
            voicePreference.current = selected;
            storedVoicePending.current = false;
            setSelectedVoiceURI(selected);
            try {
              if (selected) window.localStorage.setItem("lingora.tts.voice", selected);
              else window.localStorage.removeItem("lingora.tts.voice");
            } catch { /* Selection still works without persistence. */ }
          }}
        >
          <option value="">Otomatik</option>
          {englishVoices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>
          ))}
        </Select>
      </div>
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
            // A no-op must not invalidate the request while leaving its loading state.
            if ((value !== "en" && value !== "tr") || value === sourceLanguage) return;
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
            // A no-op must not invalidate the request while leaving its loading state.
            if ((value !== "en" && value !== "tr") || value === targetLanguage) return;
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
