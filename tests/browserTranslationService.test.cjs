const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Isolated unit fixtures: no browser inference, model download, or network call.
// Transpile with the installed compiler so the real adapter stays unmodified.
const source = fs.readFileSync(
  path.join(
    __dirname,
    "../src/features/translation/providers/browserTranslationService.ts",
  ),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

function fixture({ browser = true, createPipeline, importError } = {}) {
  let imports = 0;
  const loads = [];
  const calls = [];
  const exports = {};
  const sdk = {
    pipeline(...args) {
      loads.push(args);
      if (createPipeline) return createPipeline(...args);
      return Promise.resolve(async (...input) => {
        calls.push(input);
        return [{ translation_text: "  unit output fixture  " }];
      });
    },
  };
  new Function("exports", "require", "window", code)(
    exports,
    (specifier) => {
      assert.equal(specifier, "@huggingface/transformers");
      imports++;
      if (importError) throw importError;
      return sdk;
    },
    browser ? {} : undefined,
  );
  return {
    service: exports.browserTranslationService,
    loads,
    calls,
    imports: () => imports,
  };
}

const enTr = {
  text: "  Source fixture\n",
  sourceLanguage: "en",
  targetLanguage: "tr",
};
const trEn = {
  text: "\u0130stanbul'da g\u00f6r\u00fc\u015fmek \u00fczere.",
  sourceLanguage: "tr",
  targetLanguage: "en",
};

test("module load and SSR calls never import the model runtime", async () => {
  const f = fixture({ browser: false });
  assert.equal(f.imports(), 0);
  await assert.rejects(f.service.translate(enTr), /browser environment/);
  assert.equal(f.imports(), 0);
  assert.equal(f.loads.length, 0);
});

test("blank text and all unsupported directions reject before import", async () => {
  const f = fixture();
  for (const text of ["", " \t\n "]) {
    await assert.rejects(f.service.translate({ ...enTr, text }), /non-blank/);
  }
  for (const [sourceLanguage, targetLanguage] of [
    ["en", "en"],
    ["tr", "tr"],
    ["fr", "en"],
    ["en", "fr"],
    ["tr", "fr"],
    ["", "tr"],
  ]) {
    await assert.rejects(
      f.service.translate({ ...enTr, sourceLanguage, targetLanguage }),
      /Unsupported translation direction/,
    );
  }
  assert.equal(f.imports(), 0);
  assert.equal(f.loads.length, 0);
});

test("models, EN language options, verbatim inputs and response shape", async () => {
  const f = fixture();
  assert.equal(f.imports(), 0);
  const result = await f.service.translate(enTr);
  await f.service.translate(trEn);
  assert.deepEqual(f.loads, [
    ["translation", "Xenova/m2m100_418M"],
    ["translation", "Xenova/opus-mt-tr-en"],
  ]);
  assert.deepEqual(f.calls, [
    [enTr.text, { src_lang: "en", tgt_lang: "tr" }],
    [trEn.text],
  ]);
  assert.deepEqual(result, { text: "  unit output fixture  " });
  await f.service.translate(enTr);
  await f.service.translate(trEn);
  assert.equal(f.loads.length, 2);
});

test("concurrent first requests share one pending load per direction", async () => {
  const resolvers = [];
  const f = fixture({
    createPipeline: () => new Promise((resolve) => resolvers.push(resolve)),
  });
  const requests = [
    f.service.translate(enTr),
    f.service.translate(enTr),
    f.service.translate(trEn),
    f.service.translate(trEn),
  ];
  // Flush only microtasks; the mocked model loads remain pending.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.loads.length, 2);
  assert.equal(resolvers.length, 2);
  let inferences = 0;
  for (const resolve of resolvers) {
    resolve(async () => {
      inferences++;
      return [{ translation_text: "unit concurrent fixture" }];
    });
  }
  await Promise.all(requests);
  assert.equal(inferences, 4);
  await f.service.translate(enTr);
  assert.equal(f.loads.length, 2);
});

test("malformed, missing, empty and whitespace-only outputs reject", async () => {
  for (const output of [
    undefined,
    null,
    {},
    [],
    [null],
    [{}],
    [{ translation_text: 42 }],
    [{ translation_text: "" }],
    [{ translation_text: " \t\n " }],
  ]) {
    const f = fixture({ createPipeline: async () => async () => output });
    await assert.rejects(f.service.translate(enTr), /invalid or empty response/);
  }
});

test("model and inference errors propagate without automatic retry or fallback", async () => {
  const modelError = new Error("model failure fixture");
  const load = fixture({
    createPipeline: async () => { throw modelError; },
  });
  await assert.rejects(load.service.translate(enTr), (error) => error === modelError);
  assert.equal(load.loads.length, 1);
  await Promise.resolve();
  assert.equal(load.loads.length, 1);
  await assert.rejects(load.service.translate(enTr), (error) => error === modelError);
  assert.equal(load.loads.length, 2);

  const inferenceError = new Error("inference failure fixture");
  const inference = fixture({
    createPipeline: async () => async () => { throw inferenceError; },
  });
  await assert.rejects(
    inference.service.translate(trEn),
    (error) => error === inferenceError,
  );
  assert.deepEqual(inference.loads, [["translation", "Xenova/opus-mt-tr-en"]]);
  await assert.rejects(inference.service.translate(trEn), (error) => error === inferenceError);
  assert.equal(inference.loads.length, 1);
});

test("real load and inference boundaries emit semantic phases; warm reuse skips preparation", async () => {
  let finishLoad;
  let finishInference;
  const f = fixture({ createPipeline: () => new Promise(resolve => { finishLoad = resolve; }) });
  const phases = [];
  const first = f.service.translate(enTr, { onPhase: phase => phases.push(phase) });
  assert.deepEqual(phases, ["preparing"]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.loads.length, 1);
  finishLoad(() => new Promise(resolve => { finishInference = resolve; }));
  await new Promise(setImmediate);
  assert.deepEqual(phases, ["preparing", "translating"]);
  finishInference([{ translation_text: "unit output fixture" }]);
  await first;
  const warmPhases = [];
  const second = f.service.translate(enTr, { onPhase: phase => warmPhases.push(phase) });
  await new Promise(setImmediate);
  assert.deepEqual(warmPhases, ["translating"]);
  finishInference([{ translation_text: "warm output fixture" }]);
  await second;
  assert.equal(f.loads.length, 1);
});

test("failed concurrent load is evicted once; a user retry shares a fresh load and preserves the other direction", async () => {
  const pending = [];
  const f = fixture({ createPipeline: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
  const opus = f.service.translate(trEn);
  await new Promise(setImmediate);
  pending[0].resolve(async () => [{ translation_text: "opus fixture" }]);
  await opus;

  const phases = [[], []];
  const first = f.service.translate(enTr, { onPhase: phase => phases[0].push(phase) });
  const concurrent = f.service.translate(enTr, { onPhase: phase => phases[1].push(phase) });
  const error = new Error("first load failure fixture");
  const rejections = [
    assert.rejects(first, cause => cause === error),
    assert.rejects(concurrent, cause => cause === error),
  ];
  await new Promise(setImmediate);
  assert.equal(f.loads.length, 2);
  pending[1].reject(error);
  await Promise.all(rejections);
  assert.deepEqual(phases, [["preparing"], ["preparing"]]);
  assert.equal(f.loads.length, 2); // No automatic retry.

  const retryPhases = [[], []];
  const retry = f.service.translate(enTr, { onPhase: phase => retryPhases[0].push(phase) });
  const concurrentRetry = f.service.translate(enTr, { onPhase: phase => retryPhases[1].push(phase) });
  await new Promise(setImmediate);
  assert.equal(f.loads.length, 3);
  pending[2].resolve(async () => [{ translation_text: "retry fixture" }]);
  const results = await Promise.all([retry, concurrentRetry]);
  assert.deepEqual(results, [{ text: "retry fixture" }, { text: "retry fixture" }]);
  assert.deepEqual(retryPhases, [["preparing", "translating"], ["preparing", "translating"]]);
  await f.service.translate(trEn);
  await f.service.translate(enTr);
  assert.equal(f.loads.length, 3);
});

test("runtime import failures are also evicted without importing outside a user request", async () => {
  const error = new Error("runtime import failure fixture");
  const f = fixture({ importError: error });
  for (const attempt of [1, 2]) {
    const phases = [];
    await assert.rejects(
      f.service.translate(enTr, { onPhase: phase => phases.push(phase) }),
      cause => cause === error,
    );
    assert.equal(f.imports(), attempt);
    assert.deepEqual(phases, ["preparing"]);
    assert.equal(f.loads.length, 0);
  }
});
