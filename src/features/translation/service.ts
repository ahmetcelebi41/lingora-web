import { browserTranslationService } from "./providers/browserTranslationService";
import { BuiltInTranslatorProvider } from "./providers/builtInTranslator";
import type { TranslationService } from "./types";

const builtIn = new BuiltInTranslatorProvider();
let connections = 0;

// Provider-neutral lifecycle connection; translate contract remains unchanged.
export function connectTranslationService(): () => void {
  connections++;
  // Preflight errors are retried on the next explicit translation action.
  void builtIn.preflight().catch(() => {});
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--connections === 0) builtIn.dispose();
  };
}

export const translationService: TranslationService = {
  async translate(request, options) {
    if (typeof window === "undefined") throw new Error("Browser translation requires a browser environment.");
    if (!request.text.trim()) throw new Error("Translation requires non-blank source text.");
    if (request.sourceLanguage === "en" && request.targetLanguage === "tr") {
      const result = await builtIn.translate(request.text, options);
      if (result !== null) return result;
    }
    // Only absent/unavailable built-in EN→TR, or the unchanged TR→EN path.
    return browserTranslationService.translate(request, options);
  },
};
