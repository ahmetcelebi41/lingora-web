export function normalizeTranslationError(error: unknown): string {
  // Keep technical details out of the UI, regardless of the provider's error shape.
  void error;
  return "Çeviri tamamlanamadı. Lütfen tekrar deneyin.";
}
