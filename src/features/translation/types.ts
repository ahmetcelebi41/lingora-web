export type Language = "en" | "tr";

export type TranslationRequest = {
  text: string;
  sourceLanguage: Language;
  targetLanguage: Language;
};

export type TranslationResponse = {
  text: string;
};

export type TranslationPhase = "preparing" | "translating";

export type TranslationOptions = {
  onPhase?: (phase: TranslationPhase) => void;
};

export interface TranslationService {
  translate(
    request: TranslationRequest,
    options?: TranslationOptions,
  ): Promise<TranslationResponse>;
}
