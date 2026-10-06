export type Language = "en" | "tr";

export type TranslationRequest = {
  text: string;
  sourceLanguage: Language;
  targetLanguage: Language;
};

export type TranslationResponse = {
  text: string;
};

export interface TranslationService {
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}
