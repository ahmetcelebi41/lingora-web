const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { fixture, tick } = require("./helpers/translatorFixture.cjs");

// Inspect real rendered native markup, not simulated browser geometry or focus.
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)]
      .map((attribute) => [attribute[1].toLowerCase(), attribute[2]])));
}

function announcement(html) {
  const messages = [...html.matchAll(/<div\b[^>]*role="status"[^>]*>([^<]*)<\/div>/g)];
  assert.equal(messages.length, 1, "one persistent polite status region");
  assert.match(messages[0][0], /aria-atomic="true"/);
  return messages[0][1];
}

test("both language directions retain visible field labels and valid unique ID references", () => {
  for (const sourceLanguage of ["en", "tr"]) {
    const ui = fixture({ sourceLanguage, targetLanguage: sourceLanguage === "en" ? "tr" : "en" });
    const html = ui.html();
    const ids = tags(html, "[a-z][a-z0-9]*").map((tag) => tag.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length);
    const controls = [...tags(html, "select"), ...tags(html, "textarea")];
    assert.equal(controls.length, 5);
    for (const control of controls) {
      const label = [...html.matchAll(/<label\b[^>]*for="([^"]+)"[^>]*>([^<]+)<\/label>/g)]
        .find((match) => match[1] === control.id);
      assert.ok(label, `visible label for ${control.id}`);
      assert.ok(label[2].trim());
    }
    for (const tag of tags(html, "[a-z][a-z0-9]*")) {
      for (const attribute of ["aria-labelledby", "aria-describedby"]) {
        for (const id of (tag[attribute] ?? "").split(/\s+/).filter(Boolean)) {
          assert.ok(ids.includes(id), `resolved ${attribute}: ${id}`);
        }
      }
    }
    assert.equal(tags(html, "section").length, 2);
    assert.equal(tags(html, "h2").length, 2);
    ui.cleanup();
  }
});

test("text language follows the selected languages and swap; result remains read-only", () => {
  const ui = fixture({ sourceText: "Hello", resultText: "Merhaba" });
  const languages = () => Object.fromEntries(tags(ui.html(), "textarea").map(({ id, lang }) => [id, lang]));
  assert.deepEqual(languages(), { "source-text": "en", "result-text": "tr" });
  assert.equal(tags(ui.html(), "textarea").find(({ id }) => id === "result-text").readonly, "");
  ui.swap();
  assert.deepEqual(languages(), { "source-text": "tr", "result-text": "en" });
  ui.changeLanguage("source-language", "en");
  assert.deepEqual(languages(), { "source-text": "en", "result-text": "tr" });
  ui.cleanup();
});

test("actions keep native keyboard semantics, explicit swap name and native disabled states", () => {
  const ui = fixture();
  const html = ui.html();
  const buttons = tags(html, "button");
  assert.equal(buttons.length, 6);
  assert.ok(buttons.every(({ type }) => type === "button"));
  assert.ok(buttons.some((button) => button["aria-label"] === "Dilleri değiştir"));
  for (const name of ["Temizle", "Dinle", "Durdur", "Kopyala", "Çevir"]) {
    assert.match(html, new RegExp(`<button\\b[^>]*>${name}<\\/button>`));
  }
  assert.match(html, /<span aria-hidden="true"[^>]*><svg[^>]*focusable="false"/);
  assert.doesNotMatch(html, /tabindex=|role="button"|aria-disabled=|<button[^>]*>[^<]*<button/);
  assert.equal(ui.button().props.disabled, true);
  assert.equal(ui.copyButton().props.disabled, true);
  assert.equal(ui.actionButton("Durdur").props.disabled, true);
  ui.cleanup();
});

test("copy success uses the existing polite region and clears without stale feedback", async () => {
  const ui = fixture({ sourceText: "Hello", resultText: "Merhaba" });
  assert.equal(announcement(ui.html()), "");
  ui.clickCopy();
  ui.clipboard[0].resolve();
  await tick();
  assert.equal(announcement(ui.html()), "Kopyalandı");
  assert.equal(ui.copyButton().props.children, "Kopyalandı");
  ui.advance(1800);
  assert.equal(announcement(ui.html()), "");
  ui.clickCopy();
  ui.clear();
  ui.clipboard[1].resolve();
  await tick();
  assert.equal(announcement(ui.html()), "");
  ui.cleanup();
});

test("preparation and translation share one live region and keep the busy button disabled", () => {
  for (const [phase, expected] of [["preparing", "Model hazırlanıyor… İlk kullanım biraz sürebilir."], ["translating", "Çevriliyor…"]]) {
    const ui = fixture({ sourceText: "Hello", status: "loading", phase });
    assert.equal(announcement(ui.html()), expected);
    assert.equal(ui.button().props.disabled, true);
    assert.equal(ui.button().props["aria-busy"], true);
    assert.ok(tags(ui.html(), "select").filter(({ id }) => id !== "english-voice")
      .every((select) => Object.hasOwn(select, "disabled")));
    ui.cleanup();
  }
});

test("operation failures are alerts without falsely marking valid text as invalid", async () => {
  const ui = fixture({ sourceText: "Hello", status: "error", error: "Çeviri başlatılamadı." });
  assert.equal(tags(ui.html(), "div").filter((tag) => tag.role === "alert").length, 1);
  assert.match(ui.html(), /Çeviri başlatılamadı\./);
  assert.doesNotMatch(ui.html(), /aria-invalid="true"/);
  ui.cleanup();
  const copy = fixture({ resultText: "Merhaba" });
  copy.clickCopy();
  copy.clipboard[0].reject(new Error("denied"));
  await tick();
  assert.equal(tags(copy.html(), "div").filter((tag) => tag.role === "alert").length, 1);
  assert.match(copy.html(), /Çeviri kopyalanamadı/);
  assert.equal(announcement(copy.html()), "");
  copy.cleanup();
});

test("active field borders, text, primary action and focus meet contrast thresholds", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
  const tokens = Object.fromEntries([...read("app/globals.css").matchAll(/(--color-[\w-]+):\s*(#[\da-f]{6})/gi)]
    .map((match) => [match[1], match[2]]));
  function luminance(hex) {
    const [r, g, b] = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b, minimum) {
    const x = luminance(tokens[a]);
    const y = luminance(tokens[b]);
    const ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    assert.ok(ratio >= minimum, `${a}/${b}: ${ratio.toFixed(2)} < ${minimum}`);
  }
  const fields = read("components/ui/field.module.css");
  const border = fields.match(/\.control\s*\{[^}]*border:\s*1px solid var\((--color-[\w-]+)\)/)[1];
  const hover = fields.match(/\.control:hover[^}]*border-color:\s*var\((--color-[\w-]+)\)/)[1];
  for (const background of ["--color-surface", "--color-surface-muted"]) {
    contrast(border, background, 3);
    contrast(hover, background, 3);
    contrast("--color-error", background, 3);
  }
  for (const foreground of ["--color-foreground", "--color-foreground-secondary", "--color-error"]) {
    contrast(foreground, "--color-surface", 4.5);
  }
  contrast("--color-primary-foreground", "--color-primary", 4.5);
  for (const background of ["--color-surface", "--color-surface-muted", "--color-background"]) {
    contrast("--color-focus", background, 3);
  }
});
