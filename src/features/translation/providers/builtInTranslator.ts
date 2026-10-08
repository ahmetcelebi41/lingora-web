import type { TranslationOptions, TranslationResponse } from "../types";

type Availability = "available" | "downloadable" | "downloading" | "unavailable";
type TranslatorInstance = {
  translate(source: string): Promise<string>;
  destroy?(): void;
};
type TranslatorApi = {
  availability(options: typeof languagePair): Promise<Availability>;
  create(options: typeof languagePair): Promise<TranslatorInstance>;
};
type AvailabilityEntry = { api: TranslatorApi; promise: Promise<Availability>; value?: Availability };
type InstanceEntry = { promise: Promise<TranslatorInstance>; instance?: TranslatorInstance };
const languagePair = { sourceLanguage: "en", targetLanguage: "tr" } as const;

function getApi() {
  if (typeof window === "undefined") return undefined;
  const api = (window as Window & { Translator?: TranslatorApi }).Translator;
  // Only an absent global means unsupported; malformed/policy-blocked APIs error.
  return typeof api === "undefined" ? undefined : api;
}

function aborted() {
  return new Error("Built-in translator session was released.");
}

export class BuiltInTranslatorProvider {
  private availability?: AvailabilityEntry;
  private entry?: InstanceEntry;
  private generation = 0;

  private check(api: TranslatorApi) {
    if (this.availability?.api === api) return this.availability;
    const entry: AvailabilityEntry = { api, promise: api.availability(languagePair) };
    entry.promise = entry.promise.then((value) => {
      if (!["available", "downloadable", "downloading", "unavailable"].includes(value)) {
        throw new Error("Unexpected built-in Translator availability.");
      }
      entry.value = value;
      return value;
    }).catch((cause: unknown) => {
      if (this.availability === entry) this.availability = undefined;
      throw cause;
    });
    this.availability = entry;
    return entry;
  }

  // Called at service connection, never during import/SSR. No model is created.
  async preflight(): Promise<void> {
    const api = getApi();
    if (api) await this.check(api).promise;
  }

  private getInstance(api: TranslatorApi) {
    if (this.entry) return this.entry;
    let pending: Promise<TranslatorInstance>;
    try {
      // Invoke immediately in the translate/button stack, before any await.
      pending = api.create(languagePair);
    } catch (cause) {
      pending = Promise.reject(cause);
    }
    const entry: InstanceEntry = { promise: pending };
    entry.promise = entry.promise.then((instance) => {
      if (this.entry !== entry) {
        this.destroy(instance);
        throw aborted();
      }
      entry.instance = instance;
      return instance;
    }).catch((cause: unknown) => {
      if (this.entry === entry) this.entry = undefined;
      throw cause;
    });
    this.entry = entry;
    return entry;
  }

  // null is an explicit compatibility decision, never an error recovery path.
  async translate(source: string, options?: TranslationOptions): Promise<TranslationResponse | null> {
    const api = getApi();
    if (typeof api === "undefined") return null;
    const generation = this.generation;
    const availability = this.check(api);
    if (availability.value === "unavailable") return null;

    if (!this.entry?.instance) options?.onPhase?.("preparing");
    const entry = this.getInstance(api);
    // A click can beat preflight. Start create synchronously and observe BOTH
    // promises; only confirmed unavailable may select fallback. Never await
    // availability first and then invoke create outside the click stack.
    const creation = entry.promise.then(
      (instance) => ({ instance }),
      (error: unknown) => ({ error }),
    );
    let state: Availability;
    try {
      state = await availability.promise;
    } catch (cause) {
      this.discard(entry);
      throw cause;
    }
    if (generation !== this.generation) throw aborted();
    if (state === "unavailable") {
      this.discard(entry);
      return null;
    }
    const result = await creation;
    if ("error" in result) throw result.error;
    if (generation !== this.generation) throw aborted();
    options?.onPhase?.("translating");
    const text = await result.instance.translate(source);
    if (generation !== this.generation) throw aborted();
    if (typeof text !== "string" || !text.trim()) throw new Error("Built-in translator returned an invalid or empty response.");
    return { text };
  }

  private destroy(instance: TranslatorInstance) {
    try { instance.destroy?.(); } catch { /* Best-effort native cleanup. */ }
  }

  private discard(entry: InstanceEntry) {
    if (this.entry !== entry) return;
    this.entry = undefined;
    if (entry.instance) this.destroy(entry.instance);
    // Pending creation checks entry identity and destroys on late completion.
  }

  dispose() {
    this.generation++;
    this.availability = undefined;
    if (this.entry) this.discard(this.entry);
  }
}
