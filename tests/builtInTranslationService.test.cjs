const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { fixture: translatorFixture, tick } = require("./helpers/translatorFixture.cjs");

// Native API/SDK fixtures, never real quality evidence or downloads.
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const enTr = { text: "  untouched SOURCE.\n ", sourceLanguage: "en", targetLanguage: "tr" };
const trEn = { text: "TR source fixture", sourceLanguage: "tr", targetLanguage: "en" };
const raw = " \t- untouched <output> & punctuation.\n ";
function fixture(options = {}) {
  const creates = [], checks = [], translations = [], loads = [], localCalls = [];
  let destroyed = 0;
  const instance = {
    translate(source) {
      translations.push(source);
      return options.translate ? options.translate(source) : Promise.resolve(raw);
    },
    ...(options.destroy === false ? {} : { destroy() { destroyed++; } }),
  };
  const api = {
    availability(pair) { checks.push(pair); return options.check ? options.check() : Promise.resolve(options.availability ?? "available"); },
    create(pair) { creates.push(pair); return options.create ? options.create(instance) : Promise.resolve(instance); },
  };
  const browser = options.server ? undefined : { ...(options.unsupported ? {} : { Translator: api }), ...options.window };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const exports = {};
    modules.set(file, exports);
    new Function("exports", "require", "window", code)(exports, (specifier) => {
      if (specifier === "@huggingface/transformers") return {
        async pipeline(...args) {
          loads.push(args);
          if (options.pipeline) return options.pipeline(...args);
          return async (...args) => { localCalls.push(args); return [{ translation_text: "local fixture" }]; };
        },
      };
      assert.ok(specifier.startsWith("."), `Unexpected dependency: ${specifier}`);
      return load(path.resolve(path.dirname(file), `${specifier}.ts`));
    }, browser);
    return exports;
  }
  const service = load(path.join(__dirname, "../src/features/translation/service.ts"));
  const ui = (state = {}) => translatorFixture({ sourceText: enTr.text, ...state }, {
    window: browser, translationService: service.translationService, connectTranslationService: service.connectTranslationService,
  });
  return { ...service, creates, checks, translations, loads, localCalls, ui, destroyed: () => destroyed };
}

test("import/SSR/blank/unsupported directions never create or download", async () => {
  const f = fixture();
  assert.equal(f.checks.length, 0);
  for (const request of [{ ...enTr, text: " \t " }, { ...enTr, targetLanguage: "en" }, { ...enTr, sourceLanguage: "fr" }]) {
    await assert.rejects(f.translationService.translate(request));
  }
  const ssr = fixture({ server: true });
  const disconnect = ssr.connectTranslationService();
  await assert.rejects(ssr.translationService.translate(enTr), /browser environment/);
  disconnect();
  for (const fixture of [f, ssr]) {
    assert.equal(fixture.creates.length, 0);
    assert.equal(fixture.checks.length, 0);
    assert.equal(fixture.loads.length, 0);
  }
});

test("available/downloadable/downloading preflight is lazy; native output and instance are reused", async () => {
  for (const availability of ["available", "downloadable", "downloading"]) {
    const f = fixture({ availability });
    const disconnect = f.connectTranslationService();
    await tick();
    assert.equal(f.checks.length, 1);
    assert.equal(f.creates.length, 0);
    const phases = [];
    const first = f.translationService.translate(enTr, { onPhase: phase => phases.push(phase) });
    assert.equal(f.creates.length, 1, "create is synchronous before the first await");
    assert.deepEqual(phases, ["preparing"]);
    assert.deepEqual(await first, { text: raw });
    assert.deepEqual(phases, ["preparing", "translating"]);
    const warm = [];
    assert.deepEqual(await f.translationService.translate(enTr, { onPhase: phase => warm.push(phase) }), { text: raw });
    assert.deepEqual(warm, ["translating"]);
    assert.deepEqual(f.creates, [{ sourceLanguage: "en", targetLanguage: "tr" }]);
    assert.deepEqual(f.checks, [{ sourceLanguage: "en", targetLanguage: "tr" }]);
    assert.deepEqual(f.translations, [enTr.text, enTr.text]);
    assert.equal(f.loads.length, 0);
    disconnect(); disconnect();
    assert.equal(f.destroyed(), 1);
  }
});

test("click beating availability invokes create immediately; concurrent requests share pending instance", async () => {
  const check = deferred(), create = deferred();
  const f = fixture({ check: () => check.promise, create: (instance) => create.promise.then(() => instance) });
  const one = f.translationService.translate(enTr);
  const two = f.translationService.translate(enTr);
  assert.equal(f.creates.length, 1);
  assert.equal(f.checks.length, 1);
  assert.equal(f.translations.length, 0);
  create.resolve();
  await tick();
  assert.equal(f.translations.length, 0, "availability still unresolved");
  check.resolve("downloadable");
  assert.deepEqual(await Promise.all([one, two]), [{ text: raw }, { text: raw }]);
});

test("unsupported global and confirmed unavailable select only M2M100 fallback; TR→EN remains Opus", async () => {
  for (const options of [{ unsupported: true }, { availability: "unavailable" }]) {
    const f = fixture(options);
    const disconnect = f.connectTranslationService();
    await tick();
    assert.deepEqual(await f.translationService.translate(enTr), { text: "local fixture" });
    assert.deepEqual(await f.translationService.translate(enTr), { text: "local fixture" });
    await f.translationService.translate(trEn);
    assert.deepEqual(f.loads, [["translation", "Xenova/m2m100_418M"], ["translation", "Xenova/opus-mt-tr-en"]]);
    assert.deepEqual(f.localCalls, [[enTr.text, { src_lang: "en", tgt_lang: "tr" }], [enTr.text, { src_lang: "en", tgt_lang: "tr" }], [trEn.text]]);
    assert.equal(f.creates.length, 0);
    disconnect();
  }
  const f = fixture();
  await f.translationService.translate(trEn);
  assert.equal(f.checks.length, 0);
  assert.equal(f.creates.length, 0);
  assert.deepEqual(f.loads, [["translation", "Xenova/opus-mt-tr-en"]]);
});

test("cold unavailable may fall back only after confirmation, cleaning any speculative late instance", async () => {
  const check = deferred(), create = deferred();
  const f = fixture({ check: () => check.promise, create: (instance) => create.promise.then(() => instance) });
  const task = f.translationService.translate(enTr);
  assert.equal(f.creates.length, 1);
  assert.equal(f.loads.length, 0);
  check.resolve("unavailable");
  assert.deepEqual(await task, { text: "local fixture" });
  create.resolve(); await tick();
  assert.equal(f.destroyed(), 1);
  assert.equal(f.translations.length, 0);
});

test("create download/permission/runtime failures never silently fall back; manual retry recreates", async () => {
  for (const name of ["NetworkError", "NotAllowedError", "OperationError", "NotSupportedError"]) {
    let attempts = 0;
    const error = new DOMException("private native failure", name);
    const f = fixture({ availability: "downloadable", create: (instance) => {
      if (++attempts === 1) throw error;
      return Promise.resolve(instance);
    } });
    const disconnect = f.connectTranslationService(); await tick();
    await assert.rejects(f.translationService.translate(enTr), cause => cause === error);
    assert.equal(attempts, 1);
    assert.equal(f.loads.length, 0);
    assert.deepEqual(await f.translationService.translate(enTr), { text: raw });
    assert.equal(attempts, 2);
    disconnect();
  }
  const f = fixture({ create: async () => { throw new Error("async download failure"); } });
  await assert.rejects(f.translationService.translate(enTr), /async download/);
  assert.equal(f.loads.length, 0);
});

test("availability failure/unknown state and inference failure/invalid output never select fallback", async () => {
  for (const options of [
    { check: async () => { throw new DOMException("private policy", "NotAllowedError"); } },
    { availability: "unknown" },
    { translate: async () => { throw new Error("private inference"); } },
    ...[undefined, null, 42, "", " \t "].map(output => ({ translate: async () => output })),
  ]) {
    const f = fixture(options);
    await assert.rejects(f.translationService.translate(enTr));
    await tick();
    assert.equal(f.loads.length, 0);
  }
  let attempts = 0;
  const f = fixture({ check: async () => {
    if (++attempts === 1) throw new Error("preflight fixture");
    return "available";
  } });
  const disconnect = f.connectTranslationService(); await tick();
  assert.equal(f.creates.length, 0);
  assert.deepEqual(await f.translationService.translate(enTr), { text: raw });
  assert.equal(attempts, 2);
  disconnect();
});

test("last service disconnect cleans ready/pending instances, optional destroy and remount remain safe", async () => {
  for (const destroy of [true, false]) {
    const f = fixture({ destroy });
    const a = f.connectTranslationService(), b = f.connectTranslationService();
    await f.translationService.translate(enTr);
    a(); a(); assert.equal(f.destroyed(), 0);
    b(); assert.equal(f.destroyed(), destroy ? 1 : 0);
    const remount = f.connectTranslationService();
    await f.translationService.translate(enTr);
    assert.equal(f.creates.length, 2);
    remount(); assert.equal(f.destroyed(), destroy ? 2 : 0);
  }
  const pending = deferred();
  const f = fixture({ create: (instance) => pending.promise.then(() => instance) });
  const disconnect = f.connectTranslationService();
  const task = f.translationService.translate(enTr);
  disconnect(); pending.resolve();
  await assert.rejects(task, /released/);
  assert.equal(f.destroyed(), 1);
  assert.equal(f.translations.length, 0);
});

test("actual UI click creates synchronously, retains loading phases, raw copy and system English TTS", async () => {
  const create = deferred(), inference = deferred(), utterances = [];
  const voice = { voiceURI: "system-en", name: "System English", lang: "en-US", default: true, localService: true };
  const f = fixture({ create: instance => create.promise.then(() => instance), translate: () => inference.promise, window: {
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: { getVoices: () => [voice], speak: utterance => utterances.push(utterance), cancel() {} },
  } });
  const ui = f.ui();
  assert.equal(f.creates.length, 0);
  ui.click(); ui.click();
  assert.equal(f.creates.length, 1);
  assert.equal(ui.state.phase, "preparing");
  assert.ok(ui.html().includes("Model hazırlanıyor… İlk kullanım biraz sürebilir."));
  create.resolve(); await tick();
  assert.equal(ui.state.phase, "translating");
  inference.resolve(raw); await tick();
  assert.equal(ui.state.status, "success");
  assert.equal(ui.state.resultText, raw);
  ui.clickCopy(); assert.equal(ui.clipboard[0].text, raw);
  ui.clipboard[0].resolve(); await tick();
  assert.equal(ui.copyButton().props.children, "Kopyalandı");
  ui.clickAction("Dinle");
  assert.equal(utterances[0].text, enTr.text);
  assert.equal(utterances[0].voice, voice);
  ui.clear(); assert.equal(ui.state.sourceText, "");
  assert.equal(ui.state.resultText, "");
  assert.equal(utterances[0].onend, null);
  ui.swap(); assert.equal(ui.state.sourceLanguage, "tr");
  ui.cleanup(); assert.equal(f.destroyed(), 1);
});

test("built-in stale success/error/phase after source, swap, clear or language change cannot overwrite newer UI", async () => {
  for (const edit of [ui => ui.changeSource("changed"), ui => ui.clear(), ui => ui.swap(), ui => ui.changeLanguage("source-language", "tr")]) {
    for (const reject of [false, true]) {
      const pending = deferred();
      const f = fixture({ create: instance => pending.promise.then(() => {
        if (reject) throw new Error("stale create error");
        return instance;
      }) });
      const ui = f.ui();
      ui.click(); edit(ui);
      const expected = ui.state;
      pending.resolve(); await tick();
      assert.equal(ui.state, expected);
      assert.equal(ui.state.error, null);
      assert.equal(ui.state.phase, null);
      ui.cleanup();
    }
  }
});

test("built-in stale inference and unmount cannot overwrite a newer request or release its guard", async () => {
  for (const reject of [false, true]) {
    const pending = [];
    const f = fixture({ translate: () => { const item = deferred(); pending.push(item); return item.promise; } });
    const ui = f.ui();
    ui.click(); await tick();
    ui.changeSource("new input"); ui.click(); await tick();
    if (reject) pending[0].reject(new Error("private old failure")); else pending[0].resolve("old output");
    await tick();
    assert.equal(ui.state.status, "loading");
    assert.equal(ui.tracker.pending, true);
    ui.click(); assert.equal(pending.length, 2);
    pending[1].resolve("new output"); await tick();
    assert.equal(ui.state.resultText, "new output");
    ui.click(); await tick();
    ui.cleanup(); const updates = ui.updates;
    pending[2].resolve("unmounted output"); await tick();
    assert.equal(ui.updates, updates);
  }
});

test("native create/inference errors reach friendly UI and unlock explicit retry without local downloads", async () => {
  for (const operation of ["create", "translate"]) {
    let count = 0;
    const f = fixture({ [operation]: (instance) => {
      if (++count === 1) return Promise.reject(new Error("private native error"));
      return Promise.resolve(operation === "create" ? instance : raw);
    } });
    const ui = f.ui();
    ui.click(); await tick();
    assert.equal(ui.state.status, "error");
    assert.equal(ui.state.error, "Çeviri tamamlanamadı. Lütfen tekrar deneyin.");
    assert.equal(ui.state.phase, null);
    assert.equal(ui.tracker.pending, false);
    assert.equal(f.loads.length, 0);
    ui.click(); await tick();
    assert.equal(ui.state.status, "success");
    assert.equal(f.loads.length, 0);
    ui.cleanup();
  }
});
