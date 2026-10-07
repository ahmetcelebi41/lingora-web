const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Test the actual state/flow modules with deferred service fixtures, not inference.
const root = path.join(__dirname, "../src/features/translation");
function load(file, runtimeRequire) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", "window", output)(
    exports,
    (specifier) => specifier.startsWith(".")
      ? load(path.resolve(path.dirname(file), `${specifier}.ts`), runtimeRequire)
      : runtimeRequire(specifier),
    {},
  );
  return exports;
}

const { runTranslation, invalidateTranslationRequest } = load(path.join(root, "flow.ts"));
const {
  initialTranslationState,
  changeSourceText,
  changeLanguage,
  swapLanguages,
  clearTranslation,
} = load(path.join(root, "state.ts"));
const { normalizeTranslationError } = load(path.join(root, "errors.ts"));

function fixture(overrides = {}, serviceOverride) {
  let state = { ...initialTranslationState, sourceText: "  source fixture\n", ...overrides };
  const tracker = { id: 0, pending: false };
  const calls = [];
  const pending = [];
  const history = [];
  const service = serviceOverride ?? {
    translate(request, options) {
      calls.push(request);
      return new Promise((resolve, reject) => pending.push({ resolve, reject, onPhase: options.onPhase }));
    },
  };
  const update = (updater) => { state = updater(state); history.push(state); };
  return {
    get state() { return state; },
    tracker,
    service,
    calls,
    pending,
    history,
    update,
    submit(snapshot = state) { return runTranslation(snapshot, tracker, service, update); },
    change(action) {
      invalidateTranslationRequest(tracker);
      state = action(state);
    },
  };
}

test("blank, same-language, loading and pending guards prevent requests", async () => {
  for (const overrides of [
    { sourceText: "" },
    { sourceText: " \n\t " },
    { targetLanguage: "en" },
    { status: "loading" },
  ]) {
    const f = fixture(overrides);
    const before = f.state;
    await f.submit();
    assert.equal(f.calls.length, 0);
    assert.equal(f.state, before);
    assert.equal(f.tracker.id, 0);
  }
  const f = fixture();
  f.tracker.pending = true;
  await f.submit();
  assert.equal(f.calls.length, 0);
});

test("loading clears old feedback and success applies verbatim payload/output", async () => {
  const f = fixture({ resultText: "old result fixture", error: "old error fixture" });
  const task = f.submit();
  assert.equal(f.state.status, "loading");
  assert.equal(f.state.resultText, "");
  assert.equal(f.state.error, null);
  assert.equal(f.tracker.pending, true);
  assert.deepEqual(f.calls, [{ text: "  source fixture\n", sourceLanguage: "en", targetLanguage: "tr" }]);
  f.pending[0].resolve({ text: "  response fixture\n" });
  await task;
  assert.equal(f.state.status, "success");
  assert.equal(f.state.phase, null);
  assert.equal(f.state.resultText, "  response fixture\n");
  assert.equal(f.state.error, null);
  assert.equal(f.tracker.pending, false);
});

test("errors are normalized, settle loading and do not leak technical details", async () => {
  const f = fixture();
  const task = f.submit();
  const error = new Error("secret endpoint/runtime details fixture");
  f.pending[0].reject(error);
  await task;
  assert.equal(f.state.status, "error");
  assert.equal(f.state.phase, null);
  assert.equal(f.state.resultText, "");
  assert.equal(f.state.error, normalizeTranslationError(error));
  assert.ok(!f.state.error.includes("secret"));
  assert.equal(f.tracker.pending, false);
});

test("empty and malformed responses never become success", async () => {
  for (const response of [{ text: "" }, { text: " \n " }, { text: 42 }, null]) {
    const f = fixture();
    const task = f.submit();
    f.pending[0].resolve(response);
    await task;
    assert.equal(f.state.status, "error");
    assert.equal(f.state.resultText, "");
    assert.ok(f.state.error);
    assert.equal(f.tracker.pending, false);
  }
});

test("double submit is blocked even with a pre-render idle snapshot", async () => {
  const f = fixture();
  const snapshot = f.state;
  const first = f.submit(snapshot);
  await f.submit(snapshot);
  assert.equal(f.calls.length, 1);
  assert.equal(f.tracker.id, 1);
  f.pending[0].resolve({ text: "response fixture" });
  await first;
});

test("source, language, swap and clear changes invalidate pending success", async () => {
  const actions = [
    (state) => changeSourceText(state, "new source fixture"),
    (state) => changeLanguage(state, "sourceLanguage", "tr"),
    (state) => changeLanguage(state, "targetLanguage", "en"),
    swapLanguages,
    clearTranslation,
  ];
  for (const action of actions) {
    const f = fixture();
    const task = f.submit();
    const id = f.tracker.id;
    f.change(action);
    const expected = f.state;
    assert.ok(f.tracker.id > id);
    assert.equal(f.state.status, "idle");
    assert.equal(f.state.phase, null);
    assert.notEqual(f.state.sourceLanguage, f.state.targetLanguage);
    if (action === swapLanguages) assert.equal(f.state.sourceText, "  source fixture\n");
    f.pending[0].resolve({ text: "stale response fixture" });
    await task;
    assert.equal(f.state, expected);
    assert.equal(f.state.resultText, "");
    assert.equal(f.tracker.pending, false);
  }
});

test("a stale failure does not restore an error after source changes", async () => {
  const f = fixture();
  const task = f.submit();
  f.change((state) => changeSourceText(state, "new source fixture"));
  const expected = f.state;
  f.pending[0].reject(new Error("stale error fixture"));
  await task;
  assert.equal(f.state, expected);
  assert.equal(f.state.error, null);
});

test("old completion cannot overwrite a new request or release its submit lock", async () => {
  const f = fixture();
  const old = f.submit();
  f.change((state) => changeSourceText(state, "new source fixture"));
  const current = f.submit();
  f.pending[0].resolve({ text: "old fixture" });
  await old;
  assert.equal(f.state.status, "loading");
  assert.equal(f.state.resultText, "");
  assert.equal(f.tracker.pending, true);
  await f.submit({ ...f.state, status: "idle" });
  assert.equal(f.calls.length, 2);
  f.pending[1].resolve({ text: "current fixture" });
  await current;
  assert.equal(f.state.resultText, "current fixture");
  assert.equal(f.state.status, "success");
  assert.equal(f.tracker.pending, false);
});

test("a queued React state updater rechecks request validity when applied", async () => {
  const f = fixture();
  const queued = [];
  const task = runTranslation(f.state, f.tracker, f.service, (update) => queued.push(update));
  f.update(queued.shift());
  f.pending[0].resolve({ text: "queued stale fixture" });
  await task;
  f.change((state) => changeSourceText(state, "new source fixture"));
  const expected = f.state;
  f.update(queued.shift());
  assert.equal(f.state, expected);
});

test("unmount invalidation prevents later updates", async () => {
  const f = fixture();
  const task = f.submit();
  invalidateTranslationRequest(f.tracker);
  const expected = f.state;
  f.pending[0].resolve({ text: "unmounted fixture" });
  await task;
  assert.equal(f.state, expected);
});

function adapterFixture() {
  const loads = [];
  const inferences = [];
  const service = load(path.join(root, "providers/browserTranslationService.ts"), (specifier) => {
    assert.equal(specifier, "@huggingface/transformers");
    return {
      pipeline(task, model) {
        return new Promise((resolve, reject) => loads.push({
          task, model, reject,
          ready() {
            resolve(() => new Promise((resolve, reject) => inferences.push({ resolve, reject })));
          },
        }));
      },
    };
  }).browserTranslationService;
  return { service, loads, inferences };
}

test("adapter/flow success uses real preparation and inference boundaries; cached calls skip preparation", async () => {
  const a = adapterFixture();
  const f = fixture({}, a.service);
  const task = f.submit();
  assert.equal(f.state.status, "loading");
  assert.equal(f.state.phase, "preparing");
  await new Promise(setImmediate);
  assert.equal(a.loads.length, 1);
  a.loads[0].ready();
  await new Promise(setImmediate);
  assert.equal(f.state.status, "loading");
  assert.equal(f.state.phase, "translating");
  a.inferences[0].resolve([{ translation_text: "first success fixture" }]);
  await task;
  assert.equal(f.state.status, "success");
  assert.equal(f.state.phase, null);
  assert.equal(f.state.resultText, "first success fixture");
  assert.equal(f.tracker.pending, false);

  const start = f.history.length;
  const warm = f.submit();
  await new Promise(setImmediate);
  assert.equal(f.state.phase, "translating");
  assert.ok(f.history.slice(start).every(state => state.phase !== "preparing"));
  assert.equal(a.loads.length, 1);
  a.inferences[1].resolve([{ translation_text: "cached success fixture" }]);
  await warm;
  assert.equal(f.state.status, "success");
  assert.equal(f.state.resultText, "cached success fixture");
});

test("adapter load failure leaves normalized error and unlocks a successful user retry in both directions", async () => {
  for (const overrides of [{}, { sourceLanguage: "tr", targetLanguage: "en" }]) {
    const a = adapterFixture();
    const f = fixture(overrides, a.service);
    const failed = f.submit();
    assert.equal(f.state.phase, "preparing");
    await new Promise(setImmediate);
    a.loads[0].reject(new Error("https://private-model-fixture.invalid/runtime/weights"));
    await failed;
    assert.equal(f.state.status, "error");
    assert.equal(f.state.phase, null);
    assert.equal(f.state.resultText, "");
    assert.equal(f.state.error, "Çeviri tamamlanamadı. Lütfen tekrar deneyin.");
    assert.equal(f.tracker.pending, false);
    assert.equal(a.loads.length, 1);

    const retry = f.submit();
    assert.equal(f.state.status, "loading");
    assert.equal(f.state.phase, "preparing");
    assert.equal(f.state.error, null);
    await new Promise(setImmediate);
    assert.equal(a.loads.length, 2);
    a.loads[1].ready();
    await new Promise(setImmediate);
    assert.equal(f.state.phase, "translating");
    a.inferences[0].resolve([{ translation_text: "retry success fixture" }]);
    await retry;
    assert.equal(f.state.status, "success");
    assert.equal(f.state.resultText, "retry success fixture");
    assert.equal(f.tracker.pending, false);
  }
});

test("stale and late phase notifications cannot restore loading or overwrite a new request", async () => {
  const f = fixture();
  const old = f.submit();
  f.pending[0].onPhase("preparing");
  assert.equal(f.state.phase, "preparing");
  f.change(state => changeSourceText(state, "new source fixture"));
  const idle = f.state;
  f.pending[0].onPhase("translating");
  assert.equal(f.state, idle);
  const current = f.submit();
  f.pending[1].onPhase("preparing");
  const preparing = f.state;
  f.pending[0].onPhase("translating");
  assert.equal(f.state, preparing);
  f.pending[0].resolve({ text: "stale output fixture" });
  await old;
  assert.equal(f.state, preparing);
  assert.equal(f.tracker.pending, true);
  f.pending[1].onPhase("translating");
  f.pending[1].resolve({ text: "current output fixture" });
  await current;
  const success = f.state;
  f.pending[1].onPhase("preparing");
  assert.equal(f.state, success);

  const next = f.submit();
  invalidateTranslationRequest(f.tracker);
  const unmounted = f.state;
  f.pending[2].onPhase("preparing");
  assert.equal(f.state, unmounted);
  f.pending[2].resolve({ text: "unmounted output fixture" });
  await next;
  assert.equal(f.state, unmounted);
});

test("queued phase updaters recheck request ID and pending state when React applies them", async () => {
  const f = fixture();
  const queued = [];
  const task = runTranslation(f.state, f.tracker, f.service, update => queued.push(update));
  f.update(queued.shift());
  f.pending[0].onPhase("preparing");
  f.change(state => changeSourceText(state, "new source fixture"));
  const idle = f.state;
  f.update(queued.shift());
  assert.equal(f.state, idle);
  f.pending[0].resolve({ text: "stale fixture" });
  await task;

  const settled = runTranslation(f.state, f.tracker, f.service, update => queued.push(update));
  f.update(queued.shift());
  f.pending[1].onPhase("translating");
  f.pending[1].resolve({ text: "settled fixture" });
  await settled;
  const loading = f.state;
  f.update(queued.shift());
  assert.equal(f.state, loading); // Completion cleared pending before this phase was applied.
  f.update(queued.shift());
  assert.equal(f.state.status, "success");
  assert.equal(f.state.phase, null);
});
