const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");

// Run real Translator, Button, state and flow code with controlled hook/service
// fixtures. These checks do not simulate browser hydration or model inference.
const root = path.join(__dirname, "../src");
function fixture(overrides = {}) {
  const modules = new Map();
  let state;
  let ref;
  let cleanup;
  const pending = [];
  const service = {
    translate(request, options) {
      return new Promise((resolve, reject) => pending.push({ request, options, resolve, reject }));
    },
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const exports = {};
    modules.set(file, exports);
    new Function("exports", "require", code)(exports, specifier => {
      if (specifier.endsWith(".css")) return { __esModule: true, default: {} };
      if (specifier === "react/jsx-runtime") return jsx;
      if (specifier === "react") return {
        useState(initial) {
          state ??= { ...initial, ...overrides };
          return [state, update => { state = typeof update === "function" ? update(state) : update; }];
        },
        useRef(initial) { return ref ??= { current: initial }; },
        useEffect(effect) { cleanup ??= effect(); },
      };
      if (specifier === "@/features/translation/service") return { translationService: service };
      const base = specifier.startsWith("@/")
        ? path.join(root, specifier.slice(2))
        : path.resolve(path.dirname(file), specifier);
      const resolved = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]
        .find(candidate => fs.existsSync(candidate));
      assert.ok(resolved, `Unexpected module: ${specifier}`);
      return load(resolved);
    });
    return exports;
  }
  const { Translator } = load(path.join(root, "components/translator/Translator.tsx"));
  const { Button, Textarea } = load(path.join(root, "components/ui/index.ts"));
  function elements(node) {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== "object" || !node.props) return [];
    return [node, ...elements(node.props.children)];
  }
  const render = () => Translator();
  const cta = () => elements(render()).find(node => node.type === Button && node.props.children === "Çevir");
  render();
  return {
    get state() { return state; },
    get tracker() { return ref.current; },
    pending,
    button: () => Button(cta().props),
    html: () => renderToStaticMarkup(render()),
    click: () => cta().props.onClick(),
    changeSource(value) {
      const source = elements(render()).find(node => node.type === Textarea && node.props.id === "source-text");
      source.props.onChange({ currentTarget: { value } });
    },
    cleanup: () => cleanup(),
  };
}

const valid = { sourceText: "Hello, how are you today?" };
const tick = () => new Promise(setImmediate);

test("CTA is disabled for empty/trimmed-empty source and same-language input", () => {
  for (const sourceText of ["", " \t\n "]) {
    assert.equal(fixture({ sourceText }).button().props.disabled, true);
  }
  assert.equal(fixture({ ...valid, targetLanguage: "en" }).button().props.disabled, true);
});

test("CTA is enabled for non-empty EN to TR and TR to EN idle state", () => {
  for (const overrides of [valid, { ...valid, sourceLanguage: "tr", targetLanguage: "en" }]) {
    const f = fixture(overrides);
    assert.equal(f.state.status, "idle");
    assert.equal(f.button().props.disabled, false);
    assert.equal(f.button().props.children, "Çevir");
    assert.ok(!f.html().match(/<button[^>]*disabled[^>]*>Çevir<\/button>/));
  }
});

test("CTA stays disabled during preparation and translation with the matching loading label", () => {
  for (const [phase, label] of [
    ["preparing", "Model hazırlanıyor… İlk kullanım biraz sürebilir."],
    ["translating", "Çevriliyor…"],
  ]) {
    const f = fixture({ ...valid, status: "loading", phase });
    assert.equal(f.button().props.disabled, true);
    assert.equal(f.button().props.children, label);
    assert.equal(f.button().props["aria-busy"], true);
    assert.ok(f.html().includes('role="status"'));
  }
});

test("successful translation re-enables the actual CTA", async () => {
  const f = fixture(valid);
  f.click();
  assert.equal(f.button().props.disabled, true);
  f.pending[0].options.onPhase("preparing");
  f.pending[0].options.onPhase("translating");
  f.pending[0].resolve({ text: "unit response fixture" });
  await tick();
  assert.equal(f.state.status, "success");
  assert.equal(f.state.phase, null);
  assert.equal(f.tracker.pending, false);
  assert.equal(f.button().props.disabled, false);
});

test("failed translation re-enables the actual CTA and permits a successful user retry", async () => {
  const f = fixture(valid);
  f.click();
  f.pending[0].options.onPhase("preparing");
  f.pending[0].reject(new Error("technical runtime fixture"));
  await tick();
  assert.equal(f.state.status, "error");
  assert.equal(f.state.phase, null);
  assert.equal(f.state.resultText, "");
  assert.equal(f.tracker.pending, false);
  assert.equal(f.button().props.disabled, false);
  assert.ok(f.html().includes('role="alert"'));
  assert.ok(!f.html().includes("technical runtime"));
  f.click();
  assert.equal(f.button().props.disabled, true);
  assert.equal(f.state.error, null);
  f.pending[1].resolve({ text: "retry response fixture" });
  await tick();
  assert.equal(f.state.status, "success");
  assert.equal(f.button().props.disabled, false);
});

test("phase alone never disables an idle/success/error CTA", () => {
  for (const status of ["idle", "success", "error"]) {
    for (const phase of [null, "preparing", "translating"]) {
      assert.equal(fixture({ ...valid, status, phase }).button().props.disabled, false);
    }
  }
});

test("source edits re-enable CTA, reset feedback and invalidate stale phase/result notifications", async () => {
  const f = fixture();
  assert.equal(f.button().props.disabled, true);
  f.changeSource(valid.sourceText);
  assert.equal(f.state.sourceText, valid.sourceText);
  assert.equal(f.button().props.disabled, false);
  f.click();
  f.pending[0].options.onPhase("preparing");
  const oldId = f.tracker.id;
  f.changeSource("New source fixture");
  assert.ok(f.tracker.id > oldId);
  assert.equal(f.state.status, "idle");
  assert.equal(f.state.phase, null);
  assert.equal(f.state.error, null);
  assert.equal(f.state.resultText, "");
  assert.equal(f.button().props.disabled, false);
  const edited = f.state;
  f.pending[0].options.onPhase("translating");
  f.pending[0].resolve({ text: "stale response fixture" });
  await tick();
  assert.equal(f.state, edited);
  assert.equal(f.button().props.disabled, false);
});
