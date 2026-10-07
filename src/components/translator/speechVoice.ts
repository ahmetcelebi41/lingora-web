const language = (voice: SpeechSynthesisVoice) =>
  voice.lang.toLowerCase().replaceAll("_", "-");

export function listEnglishVoices(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice[] {
  const english = voices.filter((voice) => language(voice).startsWith("en-"));
  return [
    ...english.filter((voice) => language(voice) === "en-us"),
    ...english.filter((voice) => language(voice) !== "en-us"),
  ];
}

export function discoverEnglishVoices(
  synthesis: SpeechSynthesis,
): SpeechSynthesisVoice[] {
  try {
    return listEnglishVoices(synthesis.getVoices());
  } catch {
    // Discovery must never prevent browser-default speech.
    return [];
  }
}

export function selectEnglishVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const exact = voices.filter((voice) => language(voice) === "en-us");
  const candidates = exact.length > 0
    ? exact
    : voices.filter((voice) => language(voice).startsWith("en-"));

  // Prefer the browser default, then local service; preserve list order on ties.
  return candidates.find((voice) => voice.default)
    ?? candidates.find((voice) => voice.localService)
    ?? candidates[0];
}
