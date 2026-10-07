const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture, tick } = require("./helpers/translatorFixture.cjs");

const enTr = { sourceText: "  Hello!\nHow are you?  ", resultText: "Türkçe sonuç", status: "success" };
const trEn = { sourceText: "Türkçe kaynak", resultText: "  Good morning!\nWelcome.  ", sourceLanguage: "tr", targetLanguage: "en", status: "success" };
const failure = "Sesli okuma başlatılamadı. Tekrar deneyin.";
function speechFixture(state = enTr, options = {}) {
  const utterances = [];
  const listeners = new Set();
  let voices = options.voices ?? [];
  let discoveries = 0;
  let cancels = 0;
  const window = {
    localStorage: options.storage,
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; }
    },
    speechSynthesis: {
      getVoices() {
        discoveries++;
        if (options.discoveryError) throw new Error("private voice discovery failure");
        return voices;
      },
      addEventListener(type, listener) {
        assert.equal(type, "voiceschanged");
        listeners.add(listener);
      },
      removeEventListener(type, listener) {
        assert.equal(type, "voiceschanged");
        listeners.delete(listener);
      },
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
  if (options.noVoiceEvents) {
    delete window.speechSynthesis.addEventListener;
    delete window.speechSynthesis.removeEventListener;
  }
  const f = fixture(state, { window, server: options.server });
  f.utterances = utterances;
  f.voiceListeners = listeners;
  f.setVoices = (next, notify = true) => {
    voices = next;
    if (notify) [...listeners].forEach(listener => listener());
  };
  Object.defineProperty(f, "discoveries", { get: () => discoveries });
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
  assert.equal(f.utterances[0].rate, 0.9);
  assert.equal(f.utterances[0].pitch, 1);
  assert.equal(f.utterances[0].volume, 1);
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
  assert.equal(f.utterances[0].rate, 0.9);
  assert.equal(f.utterances[0].pitch, 1);
  assert.equal(f.utterances[0].volume, 1);
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

test("English voice discovery applies en-US priority then regional English fallback", () => {
  const british = { voiceURI: "en-GB", name: "en-GB", lang: "en-GB", default: true, localService: true };
  const american = { voiceURI: "en-US", name: "en-US", lang: "en-US", default: false, localService: false };
  for (const [voices, expected] of [[[british, american], american], [[british], british]]) {
    const f = speechFixture(enTr, { voices });
    f.clickAction("Dinle");
    assert.equal(f.utterances[0].voice, expected);
    assert.equal(f.utterances[0].text, enTr.sourceText);
  }
});

test("empty, non-English and failing discovery retain browser fallback", () => {
  for (const options of [{ voices: [] }, { voices: [{ lang: "tr-TR", default: true }] }, { discoveryError: true }]) {
    const f = speechFixture(enTr, options);
    f.clickAction("Dinle");
    assert.equal(Object.hasOwn(f.utterances[0], "voice"), false);
    assert.equal(f.utterances[0].lang, "en-US");
    assert.equal(f.actionButton("Durdur").props.disabled, false);
    assert.ok(!f.html().includes(failure));
  }
});

test("voiceschanged refreshes selection without interrupting active speech; cleanup removes listener", () => {
  const american = { voiceURI: "en-US", name: "en-US", lang: "en-US", default: true };
  const f = speechFixture(trEn);
  assert.equal(f.voiceListeners.size, 1);
  f.clickAction("Dinle");
  const discoveries = f.discoveries;
  f.setVoices([american]);
  assert.equal(f.discoveries, discoveries + 1);
  assert.equal(f.cancels, 1);
  assert.equal(f.utterances[0].voice, undefined);
  assert.equal(f.actionButton("Durdur").props.disabled, false);
  f.clickAction("Durdur");
  f.clickAction("Dinle");
  assert.equal(f.utterances[1].voice, american);
  assert.equal(f.utterances[1].text, trEn.resultText);
  const queuedListener = [...f.voiceListeners][0];
  f.cleanup();
  assert.equal(f.voiceListeners.size, 0);
  const afterCleanup = f.discoveries;
  queuedListener();
  assert.equal(f.discoveries, afterCleanup);
});

test("each Listen refreshes voice discovery even without a voiceschanged notification", () => {
  const f = speechFixture();
  f.clickAction("Dinle");
  f.utterances[0].onend();
  const american = { voiceURI: "en-US", name: "en-US", lang: "en-US" };
  f.setVoices([american], false);
  f.clickAction("Dinle");
  assert.equal(f.utterances[1].voice, american);
  f.clickAction("Durdur");
  f.setVoices([], false);
  f.clickAction("Dinle");
  assert.equal(Object.hasOwn(f.utterances[2], "voice"), false);
});

test("browsers without voice events still discover late voices on Listen and clean up safely", () => {
  const f = speechFixture(trEn, { noVoiceEvents: true });
  assert.equal(f.voiceListeners.size, 0);
  f.clickAction("Dinle");
  assert.equal(Object.hasOwn(f.utterances[0], "voice"), false);
  f.clickAction("Durdur");
  const english = { voiceURI: "en-GB", name: "en-GB", lang: "en-GB", localService: true };
  f.setVoices([english], false);
  f.clickAction("Dinle");
  assert.equal(f.utterances[1].voice, english);
  assert.equal(f.utterances[1].text, trEn.resultText);
  f.cleanup();
  assert.equal(f.utterances[1].onerror, null);
  assert.ok(!f.html().includes(failure));
});

function voiceStorage(initial) {
  const values = new Map(initial ? [["lingora.tts.voice", initial]] : []);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}
const usVoice = { voiceURI: "voice-us", name: "English US", lang: "en-US" };
const gbVoice = { voiceURI: "voice-gb", name: "English UK", lang: "en-GB" };

test("voice select is native, visibly labeled, Automatic first, English-only and en-US first", () => {
  const f = speechFixture(enTr, { voices: [gbVoice, { voiceURI: "tr", name: "Turkish", lang: "tr-TR" }, usVoice] });
  const select = f.voiceSelect();
  assert.equal(select.props.children.type, "select");
  assert.equal(select.props.children.props.disabled, false);
  const html = f.html();
  assert.ok(html.includes('for="english-voice"'));
  assert.ok(html.includes("İngilizce ses"));
  assert.ok(html.indexOf("Otomatik") < html.indexOf("English US"));
  assert.ok(html.indexOf("English US") < html.indexOf("English UK"));
  assert.ok(!html.includes("Turkish"));
  f.clickAction("Dinle");
  assert.equal(f.utterances[0].voice, usVoice);
});

test("user voice selection applies by URI on both English panels and preserves speech settings", () => {
  for (const state of [enTr, trEn]) {
    const storage = voiceStorage();
    const f = speechFixture(state, { voices: [usVoice, gbVoice], storage });
    f.changeVoice(gbVoice.voiceURI);
    assert.equal(storage.getItem("lingora.tts.voice"), gbVoice.voiceURI);
    f.clickAction("Dinle");
    const utterance = f.utterances[0];
    assert.equal(utterance.voice, gbVoice);
    assert.equal(utterance.text, state === enTr ? state.sourceText : state.resultText);
    assert.equal(utterance.lang, "en-US");
    assert.equal(utterance.rate, 0.9);
    assert.equal(utterance.pitch, 1);
    assert.equal(utterance.volume, 1);
    f.changeVoice("");
    assert.equal(f.actionButton("Durdur").props.disabled, true);
    assert.equal(storage.getItem("lingora.tts.voice"), null);
    f.clickAction("Dinle");
    assert.equal(f.utterances[1].voice, usVoice);
    assert.ok(!f.html().includes(failure));
  }
});

test("stored URI restores across opens and late voiceschanged; refreshed objects resolve by URI", () => {
  const storage = voiceStorage(gbVoice.voiceURI);
  const f = speechFixture(enTr, { storage });
  assert.equal(f.voiceSelect().props.children.props.value, "");
  f.clickAction("Dinle");
  assert.equal(Object.hasOwn(f.utterances[0], "voice"), false);
  f.clickAction("Durdur");
  const replacement = { ...gbVoice, name: "Renamed English" };
  f.setVoices([usVoice, replacement]);
  assert.equal(f.voiceSelect().props.children.props.value, gbVoice.voiceURI);
  f.clickAction("Dinle");
  assert.equal(f.utterances[1].voice, replacement);
  const reopened = speechFixture(trEn, { voices: [replacement], storage });
  assert.equal(reopened.voiceSelect().props.children.props.value, gbVoice.voiceURI);
  reopened.clickAction("Dinle");
  assert.equal(reopened.utterances[0].voice, replacement);
});

test("missing stored or removed selected voice returns to Automatic and clears persistence", () => {
  const storage = voiceStorage("missing-uri");
  const f = speechFixture(enTr, { voices: [usVoice, gbVoice], storage });
  assert.equal(f.voiceSelect().props.children.props.value, "");
  assert.equal(storage.getItem("lingora.tts.voice"), null);
  f.changeVoice(gbVoice.voiceURI);
  f.setVoices([usVoice]);
  assert.equal(f.voiceSelect().props.children.props.value, "");
  assert.equal(storage.getItem("lingora.tts.voice"), null);
  f.clickAction("Dinle");
  assert.equal(f.utterances[0].voice, usVoice);
  f.clickAction("Durdur");
  f.changeVoice(usVoice.voiceURI);
  f.setVoices([]);
  assert.equal(f.voiceSelect().props.children.props.value, "");
  f.clickAction("Dinle");
  assert.equal(Object.hasOwn(f.utterances[1], "voice"), false);
});

test("unavailable or denied storage never blocks selected voice, Automatic or cleanup", () => {
  const denied = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { throw new Error("denied"); },
  };
  for (const storage of [undefined, denied]) {
    const f = speechFixture(enTr, { voices: [usVoice, gbVoice], storage });
    f.changeVoice(gbVoice.voiceURI);
    f.clickAction("Dinle");
    assert.equal(f.utterances[0].voice, gbVoice);
    f.changeVoice("");
    f.clickAction("Dinle");
    assert.equal(f.utterances[1].voice, usVoice);
    f.cleanup();
  }
});

test("empty and unsupported browsers keep Automatic; SSR never reads storage", () => {
  const f = speechFixture();
  assert.equal(f.voiceSelect().props.children.props.disabled, true);
  assert.ok(f.html().includes("Otomatik"));
  f.clickAction("Dinle");
  assert.equal(Object.hasOwn(f.utterances[0], "voice"), false);
  const unsupported = fixture(enTr, { window: {} });
  assert.equal(unsupported.voiceSelect().props.children.props.disabled, true);
  assert.equal(unsupported.actionButton("Dinle").props.disabled, true);
  assert.equal(unsupported.actionButton("Durdur").props.disabled, true);
  const server = speechFixture(enTr, { server: true, storage: { getItem() { assert.fail("SSR storage access"); } } });
  assert.equal(server.voiceSelect().props.children.props.disabled, true);
  assert.equal(server.discoveries, 0);
});
