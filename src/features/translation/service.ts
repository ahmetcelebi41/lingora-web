import { browserTranslationService } from "./providers/browserTranslationService";
import type { TranslationService } from "./types";

export const translationService: TranslationService = browserTranslationService;
