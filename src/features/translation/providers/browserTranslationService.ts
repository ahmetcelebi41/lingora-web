import type { TranslationPipeline } from "@huggingface/transformers";
import type {
  Language,
  TranslationResponse,
  TranslationService,
} from "../types";

type Direction = "en-tr" | "tr-en";

const models: Record<Direction, string> = {
  "en-tr": "Xenova/m2m100_418M",
  "tr-en": "Xenova/opus-mt-tr-en",
};

// Cache pending loads as well as ready pipelines, independently per direction.
type PipelineEntry = {
  promise: Promise<TranslationPipeline>;
  ready: boolean;
};

const pipelines = new Map<Direction, PipelineEntry>();

function getDirection(source: Language, target: Language): Direction {
  if (source === "en" && target === "tr") return "en-tr";
  if (source === "tr" && target === "en") return "tr-en";
  throw new Error("Unsupported translation direction.");
}

async function loadPipeline(direction: Direction): Promise<TranslationPipeline> {
  const { pipeline } = await import("@huggingface/transformers");
  // 4.3.1 supports progress_callback, but enabling it also fetches file metadata
  // for aggregate totals. Two semantic phases need only the real load/inference
  // boundaries, so leave library progress and persistent caching unchanged.
  return pipeline("translation", models[direction]);
}

function getPipeline(direction: Direction): PipelineEntry {
  const existing = pipelines.get(direction);
  if (existing) return existing;

  const entry: PipelineEntry = {
    promise: loadPipeline(direction),
    ready: false,
  };
  entry.promise = entry.promise.then(
    (translator) => {
      entry.ready = true;
      return translator;
    },
    (cause: unknown) => {
      // Evict only this failed load. A later user action can start a fresh load;
      // concurrent callers still share this rejection. Never retry automatically.
      if (pipelines.get(direction) === entry) pipelines.delete(direction);
      throw cause;
    },
  );
  pipelines.set(direction, entry);
  return entry;
}

function normalizeOutput(output: unknown): TranslationResponse {
  if (Array.isArray(output)) {
    const first: unknown = output[0];
    if (
      typeof first === "object" &&
      first !== null &&
      "translation_text" in first &&
      typeof first.translation_text === "string" &&
      first.translation_text.trim().length > 0
    ) {
      return { text: first.translation_text };
    }
  }
  throw new Error("Translation pipeline returned an invalid or empty response.");
}

export const browserTranslationService: TranslationService = {
  async translate(request, options) {
    // This also prevents runtime import/model downloads if called during SSR.
    if (typeof window === "undefined") {
      throw new Error("Browser translation requires a browser environment.");
    }

    const direction = getDirection(
      request.sourceLanguage,
      request.targetLanguage,
    );
    if (!request.text.trim()) {
      throw new Error("Translation requires non-blank source text.");
    }

    const entry = getPipeline(direction);
    if (!entry.ready) options?.onPhase?.("preparing");
    const translator = await entry.promise;
    options?.onPhase?.("translating");
    // Preserve source text verbatim; only the multilingual model needs options.
    const output =
      direction === "en-tr"
        ? await translator(request.text, { src_lang: "en", tgt_lang: "tr" })
        : await translator(request.text);

    // Provider errors propagate to the caller's normalizeTranslationError boundary.
    return normalizeOutput(output);
  },
};
