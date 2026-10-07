const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");

// Real component/state/flow code, controlled hooks, browser APIs and clock.
// This fixture does not simulate browser hydration or model inference.
const root = path.join(__dirname, "../../src");
function fixture(overrides = {}, options = {}) {
  const modules = new Map();
  const hooks = [];
  const cleanups = [];
  const timers = new Map();
  const pending = [];
  const clipboard = [];
  let cursor = 0;
  let now = 0;
  let timerId = 0;
  let updates = 0;
  const navigator = Object.hasOwn(options, "navigator") ? options.navigator : {
    clipboard: {
      writeText(text) {
        return new Promise((resolve, reject) => clipboard.push({ text, resolve, reject }));
      },
    },
  };
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
    new Function("exports", "require", "navigator", "setTimeout", "clearTimeout", "window", code)(exports, specifier => {
      if (specifier.endsWith(".css")) return { __esModule: true, default: {} };
      if (specifier === "react/jsx-runtime") return jsx;
      if (specifier === "react") return {
        useState(initial) {
          const index = cursor++;
          hooks[index] ??= { value: index === 0 ? { ...initial, ...overrides } : initial };
          return [hooks[index].value, update => {
            updates += 1;
            hooks[index].value = typeof update === "function" ? update(hooks[index].value) : update;
          }];
        },
        useRef(initial) {
          const index = cursor++;
          return hooks[index] ??= { current: initial };
        },
        useEffect(effect) {
          const index = cursor++;
          if (!hooks[index]) {
            hooks[index] = {};
            cleanups.push(effect());
          }
        },
        useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
          cursor++;
          return options.server ? serverSnapshot() : snapshot();
        },
      };
      if (specifier === "@/features/translation/service") return { translationService: service };
      const base = specifier.startsWith("@/")
        ? path.join(root, specifier.slice(2))
        : path.resolve(path.dirname(file), specifier);
      const resolved = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]
        .find(candidate => fs.existsSync(candidate));
      assert.ok(resolved, `Unexpected module: ${specifier}`);
      return load(resolved);
    }, navigator, (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    }, id => timers.delete(id), options.window);
    return exports;
  }
  const { Translator } = load(path.join(root, "components/translator/Translator.tsx"));
  const { Button, IconButton, Textarea, Select } = load(path.join(root, "components/ui/index.ts"));
  function elements(node) {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== "object" || !node.props) return [];
    return [node, ...elements(node.props.children)];
  }
  const render = () => { cursor = 0; return Translator(); };
  const find = predicate => {
    const node = elements(render()).find(predicate);
    assert.ok(node, "Expected UI control");
    return node;
  };
  const button = label => find(node => node.type === Button && node.props.children === label);
  const copyButton = () => find(node => node.type === Button && ["Kopyala", "Kopyalandı"].includes(node.props.children));
  render();
  return {
    get state() { return hooks[0].value; },
    get tracker() { return hooks[1].current; },
    get updates() { return updates; },
    pending, clipboard, timers,
    button: () => Button(button("Çevir").props),
    copyButton: () => Button(copyButton().props),
    actionButton: label => Button(button(label).props),
    clickAction: label => button(label).props.onClick(),
    controlsInPanel(id, label) {
      const panel = find(node => node.type === "section" && node.props["aria-labelledby"] === id);
      return elements(panel).filter(node => node.type === Button && node.props.children === label).length;
    },
    html: () => renderToStaticMarkup(render()),
    click: () => button("Çevir").props.onClick(),
    clickCopy: () => copyButton().props.onClick(),
    changeSource(value) {
      find(node => node.type === Textarea && node.props.id === "source-text")
        .props.onChange({ currentTarget: { value } });
    },
    changeLanguage(id, value) {
      find(node => node.type === Select && node.props.id === id)
        .props.onChange({ currentTarget: { value } });
    },
    clear: () => button("Temizle").props.onClick(),
    swap: () => find(node => node.type === IconButton).props.onClick(),
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
    cleanup: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

module.exports = { fixture, tick: () => new Promise(setImmediate) };
