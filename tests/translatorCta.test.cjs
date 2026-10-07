const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture, tick } = require("./helpers/translatorFixture.cjs");

const valid = { sourceText: "Hello, how are you today?" };

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
