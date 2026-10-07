import { normalizeTranslationError } from "./errors";
import type { TranslationState } from "./state";
import type { TranslationService } from "./types";

export type TranslationRequestTracker = {
  id: number;
  pending: boolean;
};

type UpdateState = (
  update: (previous: TranslationState) => TranslationState,
) => void;

export function invalidateTranslationRequest(
  tracker: TranslationRequestTracker,
): void {
  tracker.id += 1;
  tracker.pending = false;
}

export async function runTranslation(
  state: TranslationState,
  tracker: TranslationRequestTracker,
  service: TranslationService,
  updateState: UpdateState,
): Promise<void> {
  if (
    !state.sourceText.trim() ||
    state.sourceLanguage === state.targetLanguage ||
    state.status === "loading" ||
    tracker.pending
  ) {
    return;
  }

  const id = ++tracker.id;
  // Lock synchronously, before React commits its loading state.
  tracker.pending = true;
  updateState((previous) => ({
    ...previous,
    status: "loading",
    phase: null,
    error: null,
    resultText: "",
  }));

  try {
    const response = await service.translate(
      {
        text: state.sourceText,
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
      },
      {
        onPhase(phase) {
          if (tracker.id !== id || !tracker.pending) return;
          updateState((previous) =>
            tracker.id === id &&
            tracker.pending &&
            previous.status === "loading" &&
            previous.phase !== phase
              ? { ...previous, phase }
              : previous,
          );
        },
      },
    );
    if (tracker.id !== id) return;
    if (typeof response.text !== "string" || !response.text.trim()) {
      throw new Error("Translation service returned an empty response.");
    }
    updateState((previous) =>
      tracker.id === id
        ? {
            ...previous,
            resultText: response.text,
            status: "success",
            phase: null,
            error: null,
          }
        : previous,
    );
  } catch (cause: unknown) {
    if (tracker.id !== id) return;
    const error = normalizeTranslationError(cause);
    updateState((previous) =>
      tracker.id === id
        ? { ...previous, resultText: "", status: "error", phase: null, error }
        : previous,
    );
  } finally {
    if (tracker.id === id) tracker.pending = false;
  }
}
