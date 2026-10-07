const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture, tick } = require("./helpers/translatorFixture.cjs");

const enTr = { sourceText: "  Hello!\nHow are you?  ", resultText: "Türkçe sonuç", status: "success" };
const trEn = { sourceText: "Türkçe kaynak", resultText: "  Good morning!\nWelcome.  ", sourceLanguage: "tr", targetLanguage: "en", status: "success" };
const failure = "Sesli okuma başlatılamadı. Tekrar deneyin.";
function speechFixture(state = enTr, options = {}) {
  const utterances = [];
  let cancels = 0;
  const window = {
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; }
    },
    speechSynthesis: {
      cancel() {
        cancels++;
        if (options.cancelError) throw new Error("private cancel failure");
        utterances.at(-1)?.onerror?.({ error: "interrupted" });
      },
      speak(utterance) {
        utterances.push(utterance);
        if (options.speakError) throw new Error("private engine failure");
      },
    },
  };
  const f = fixture(state, { window, server: options.server });
  f.utterances = utterances;
  Object.defineProperty(f, "cancels", { get: () => cancels });
  return f;
}

test("EN to TR reads verbatim English source with exactly one control set in source panel", () => {
  const f = speechFixture();
  assert.equal(f.actionButton("Dinle").props.disabled, false);
  assert.equal(f.controlsInPanel("source-heading", "Dinle"), 1);
  assert.equal(f.controlsInPanel("result-heading", "Dinle"), 0);
  assert.equal(f.controlsInPanel("source-heading", "Durdur"), 1);
  f.clickAction("Dinle");
  assert.equal(f.cancels, 1);
  assert.equal(f.utterances[0].text, enTr.sourceText);
  assert.equal(f.utterances[0].lang, "en-US");
  assert.equal(f.utterances[0].voice, undefined);
  assert.equal(f.actionButton("Dinle").type, "button");
});

test("TR to EN reads verbatim English result with controls only in result panel", () => {
  const f = speechFixture(trEn);
  assert.equal(f.actionButton("Dinle").props.disabled, false);
  assert.equal(f.controlsInPanel("source-heading", "Dinle"), 0);
  assert.equal(f.controlsInPanel("result-heading", "Dinle"), 1);
  f.clickAction("Dinle");
  assert.equal(f.utterances[0].text, trEn.resultText);
  assert.equal(f.utterances[0].lang, "en-US");
});

test("blank English and loading disable listen and guarded clicks never speak", () => {
  for (const state of [
    { ...enTr, sourceText: "" }, { ...enTr, sourceText: " \n " },
    { ...trEn, resultText: "" }, { ...trEn, resultText: " \t " },
    { ...enTr, status: "loading", phase: "preparing" },
    { ...trEn, status: "loading", phase: "translating" },
  ]) {
    const f = speechFixture(state);
    assert.equal(f.actionButton("Dinle").props.disabled, true);
    assert.equal(f.actionButton("Durdur").props.disabled, true);
    f.clickAction("Dinle");
    assert.equal(f.utterances.length, 0);
  }
});

test("speaking disables listen and enables stop; repeated clicks cannot queue speech", () => {
  const f = speechFixture();
  f.clickAction("Dinle");
  assert.equal(f.actionButton("Dinle").props.disabled, true);
  assert.equal(f.actionButton("Durdur").props.disabled, false);
  f.clickAction("Dinle");
  assert.equal(f.utterances.length, 1);
});

test("stop cancels active speech, returns idle and suppresses cancellation errors", () => {
  const f = speechFixture();
  f.clickAction("Dinle");
  const oldError = f.utterances[0].onerror;
  f.clickAction("Durdur");
  assert.equal(f.cancels, 2);
  oldError({ error: "interrupted" });
  assert.equal(f.actionButton("Dinle").props.disabled, false);
  assert.equal(f.actionButton("Durdur").props.disabled, true);
  assert.ok(!f.html().includes(failure));
});

test("end returns idle and the next listen creates a new utterance", () => {
  const f = speechFixture();
  f.clickAction("Dinle");
  f.utterances[0].onend();
  assert.equal(f.actionButton("Dinle").props.disabled, false);
  assert.equal(f.actionButton("Durdur").props.disabled, true);
  f.clickAction("Dinle");
  assert.notEqual(f.utterances[0], f.utterances[1]);
});

test("speech errors are friendly and isolated, with successful user retry", () => {
  const f = speechFixture();
  const state = f.state;
  f.clickAction("Dinle");
  f.utterances[0].onerror({ error: "voice-unavailable", message: "private browser detail" });
  assert.equal(f.state, state);
  assert.equal(f.actionButton("Durdur").props.disabled, true);
  assert.equal(f.actionButton("Dinle").props.disabled, false);
  assert.ok(f.html().includes(failure));
  assert.ok(f.html().includes('role="alert"'));
  assert.ok(!f.html().includes("private browser detail"));
  f.clickAction("Dinle");
  assert.ok(!f.html().includes(failure));
  assert.equal(f.utterances.length, 2);
});

test("synchronous speak/cancel failures cannot crash the UI", () => {
  for (const options of [{ speakError: true }, { cancelError: true }]) {
    const f = speechFixture(enTr, options);
    f.clickAction("Dinle");
    assert.ok(f.html().includes(failure));
    assert.ok(!f.html().includes("private"));
    assert.equal(f.actionButton("Durdur").props.disabled, true);
    assert.equal(f.actionButton("Dinle").props.disabled, false);
    f.cleanup();
  }
});

test("canceled/interrupted events settle idle without a user error", () => {
  for (const error of ["canceled", "interrupted"]) {
    const f = speechFixture();
    f.clickAction("Dinle");
    f.utterances[0].onerror({ error });
    assert.equal(f.actionButton("Durdur").props.disabled, true);
    assert.ok(!f.html().includes(failure));
  }
});

test("source edits, language changes, clear and swap cancel both English sides", () => {
  for (const state of [enTr, trEn]) {
    for (const action of [
      f => f.changeSource("Changed source"), f => f.clear(), f => f.swap(),
      f => f.changeLanguage("source-language", state.targetLanguage || "tr"),
      f => f.changeLanguage("target-language", state.sourceLanguage || "en"),
    ]) {
      const f = speechFixture(state);
      f.clickAction("Dinle");
      action(f);
      assert.equal(f.cancels, 2);
      assert.equal(f.actionButton("Durdur").props.disabled, true);
      assert.ok(!f.html().includes(failure));
      assert.equal(f.utterances[0].onend, null);
      assert.equal(f.utterances[0].onerror, null);
    }
  }
});

test("new translation cancels speech and a new English result can be read", async () => {
  const f = speechFixture(trEn);
  f.clickAction("Dinle");
  f.click();
  assert.equal(f.cancels, 2);
  assert.equal(f.actionButton("Dinle").props.disabled, true);
  f.pending[0].resolve({ text: "New English result" });
  await tick();
  assert.equal(f.state.resultText, "New English result");
  assert.equal(f.actionButton("Dinle").props.disabled, false);
  f.clickAction("Dinle");
  assert.equal(f.utterances[1].text, "New English result");
});

test("Turkish-only panels never expose speech controls", () => {
  const f = speechFixture({ ...enTr, sourceLanguage: "tr", targetLanguage: "tr" });
  for (const panel of ["source-heading", "result-heading"]) {
    assert.equal(f.controlsInPanel(panel, "Dinle"), 0);
    assert.equal(f.controlsInPanel(panel, "Durdur"), 0);
  }
  assert.equal(f.utterances.length, 0);
});

test("old speech callbacks cannot change a newer speech or update after unmount", () => {
  const f = speechFixture();
  f.clickAction("Dinle");
  const { onend, onerror } = f.utterances[0];
  f.clickAction("Durdur");
  f.clickAction("Dinle");
  onend();
  onerror({ error: "synthesis-failed" });
  assert.equal(f.actionButton("Durdur").props.disabled, false);
  assert.ok(!f.html().includes(failure));
  const latest = f.utterances[1];
  const lateEnd = latest.onend;
  const lateError = latest.onerror;
  f.cleanup();
  const updates = f.updates;
  assert.equal(f.cancels, 4);
  assert.equal(latest.onend, null);
  lateEnd();
  lateError({ error: "synthesis-failed" });
  assert.equal(f.updates, updates);
});

test("unsupported APIs and server rendering keep TTS disabled and copy/translation working", async () => {
  for (const window of [undefined, {}, { speechSynthesis: { speak() {}, cancel() {} } }, { SpeechSynthesisUtterance: class {} }]) {
    const f = fixture(enTr, { window });
    assert.equal(f.actionButton("Dinle").props.disabled, true);
    f.clickAction("Dinle");
    assert.equal(f.button().props.disabled, false);
    f.clickCopy();
    f.clipboard[0].resolve();
    await tick();
    assert.equal(f.copyButton().props.children, "Kopyalandı");
    f.click();
    f.pending[0].resolve({ text: "Translation still works" });
    await tick();
    assert.equal(f.state.resultText, "Translation still works");
  }
  assert.equal(speechFixture(enTr, { server: true }).actionButton("Dinle").props.disabled, true);
});

test("speech and copy feedback coexist without resetting each other", async () => {
  const f = speechFixture(trEn);
  f.clickCopy();
  f.clipboard[0].resolve();
  await tick();
  f.clickAction("Dinle");
  assert.equal(f.copyButton().props.children, "Kopyalandı");
  f.utterances[0].onerror({ error: "synthesis-failed" });
  assert.equal(f.copyButton().props.children, "Kopyalandı");
  f.advance(1800);
  assert.equal(f.copyButton().props.children, "Kopyala");
  assert.ok(f.html().includes(failure));
});
