import type { Language } from "./types";

export type TranslationStatus = "idle" | "loading" | "success" | "error";

export type TranslationState = {
  sourceText: string;
  resultText: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  status: TranslationStatus;
  error: string | null;
};

export const initialTranslationState: TranslationState = {
  sourceText: "",
  resultText: "",
  sourceLanguage: "en",
  targetLanguage: "tr",
  status: "idle",
  error: null,
};

// Every input change invalidates the previous result and feedback together.
function resetFeedback(state: TranslationState): TranslationState {
  return { ...state, resultText: "", status: "idle", error: null };
}

export function changeSourceText(
  state: TranslationState,
  sourceText: string,
): TranslationState {
  return resetFeedback({ ...state, sourceText });
}

export function changeLanguage(
  state: TranslationState,
  field: "sourceLanguage" | "targetLanguage",
  value: string,
): TranslationState {
  if (value !== "en" && value !== "tr") return state;
  if (state[field] === value) return state;

  const otherLanguage: Language = value === "en" ? "tr" : "en";
  return resetFeedback({
    ...state,
    sourceLanguage: field === "sourceLanguage" ? value : otherLanguage,
    targetLanguage: field === "targetLanguage" ? value : otherLanguage,
  });
}

export function swapLanguages(state: TranslationState): TranslationState {
  return resetFeedback({
    ...state,
    sourceLanguage: state.targetLanguage,
    targetLanguage: state.sourceLanguage,
  });
}

export function clearTranslation(state: TranslationState): TranslationState {
  return resetFeedback({ ...state, sourceText: "" });
}
