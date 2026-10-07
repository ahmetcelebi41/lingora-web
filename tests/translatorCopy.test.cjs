const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture, tick } = require("./helpers/translatorFixture.cjs");

const translated = { sourceText: "Hello", resultText: "  Merhaba.\nİyi günler!  ", status: "success" };
const failure = "Çeviri kopyalanamadı. Tekrar deneyin.";
async function copied(f) {
  f.clickCopy();
  f.clipboard.at(-1).resolve();
  await tick();
}

test("copy is disabled without a nonblank result and ignores guarded clicks", () => {
  for (const resultText of ["", " \t\n "]) {
    const f = fixture({ ...translated, resultText });
    assert.equal(f.copyButton().props.disabled, true);
    f.clickCopy();
    assert.equal(f.clipboard.length, 0);
  }
});

test("copy enables a native button with a result while TTS controls remain disabled", () => {
  const f = fixture(translated);
  assert.equal(f.copyButton().type, "button");
  assert.equal(f.copyButton().props.type, "button");
  assert.equal(f.copyButton().props.disabled, false);
  assert.equal(f.actionButton("Dinle").props.disabled, true);
  assert.equal(f.actionButton("Durdur").props.disabled, true);
});

test("copy is disabled during both loading phases even with an existing result", () => {
  for (const phase of ["preparing", "translating"]) {
    const f = fixture({ ...translated, status: "loading", phase });
    assert.equal(f.copyButton().props.disabled, true);
    f.clickCopy();
    assert.equal(f.clipboard.length, 0);
  }
});

test("clipboard receives the exact result and success feedback resets after 1800 ms", async () => {
  const f = fixture(translated);
  const state = f.state;
  f.clickCopy();
  assert.equal(f.clipboard[0].text, translated.resultText);
  assert.equal(f.copyButton().props.children, "Kopyala");
  f.clipboard[0].resolve();
  await tick();
  assert.equal(f.copyButton().props.children, "Kopyalandı");
  assert.equal(f.state, state);
  f.advance(1799);
  assert.equal(f.copyButton().props.children, "Kopyalandı");
  f.advance(1);
  assert.equal(f.copyButton().props.children, "Kopyala");
  assert.equal(f.timers.size, 0);
});

test("repeated copy replaces the feedback timer", async () => {
  const f = fixture(translated);
  await copied(f);
  f.advance(1000);
  await copied(f);
  assert.equal(f.timers.size, 1);
  f.advance(800);
  assert.equal(f.copyButton().props.children, "Kopyalandı");
  f.advance(1000);
  assert.equal(f.copyButton().props.children, "Kopyala");
});

test("clipboard rejection uses a separate friendly error and allows retry", async () => {
  const f = fixture({ ...translated, error: "Existing translation feedback" });
  const state = f.state;
  f.clickCopy();
  f.clipboard[0].reject(new Error("private clipboard denial detail"));
  await tick();
  assert.equal(f.state, state);
  assert.ok(f.html().includes(failure));
  assert.ok(f.html().includes('role="alert"'));
  assert.ok(!f.html().includes("private clipboard"));
  assert.equal(f.copyButton().props.disabled, false);
  await copied(f);
  assert.ok(!f.html().includes(failure));
  assert.equal(f.copyButton().props.children, "Kopyalandı");
});

test("missing Clipboard API fails safely without changing translation state", async () => {
  const f = fixture(translated, { navigator: {} });
  const state = f.state;
  f.clickCopy();
  await tick();
  assert.ok(f.html().includes(failure));
  assert.equal(f.state, state);
  assert.equal(f.copyButton().props.children, "Kopyala");
});

test("new translation resets feedback for changed and identical results", async () => {
  for (const text of ["Yeni sonuç", translated.resultText]) {
    const f = fixture(translated);
    await copied(f);
    f.click();
    assert.equal(f.timers.size, 0);
    assert.equal(f.copyButton().props.children, "Kopyala");
    assert.equal(f.copyButton().props.disabled, true);
    f.pending[0].resolve({ text });
    await tick();
    assert.equal(f.state.resultText, text);
    assert.equal(f.copyButton().props.children, "Kopyala");
    assert.equal(f.copyButton().props.disabled, false);
    f.clickCopy();
    assert.equal(f.clipboard[1].text, text);
  }
});

test("source, languages, clear and swap reset copied and error feedback", async () => {
  const actions = [
    f => f.changeSource("New source"),
    f => f.changeLanguage("source-language", "tr"),
    f => f.changeLanguage("target-language", "en"),
    f => f.clear(),
    f => f.swap(),
  ];
  for (const action of actions) {
    for (const feedback of ["copied", "error"]) {
      const f = fixture(translated);
      f.clickCopy();
      if (feedback === "copied") f.clipboard[0].resolve();
      else f.clipboard[0].reject(new Error("denied"));
      await tick();
      action(f);
      assert.equal(f.timers.size, 0);
      assert.equal(f.copyButton().props.children, "Kopyala");
      assert.equal(f.copyButton().props.disabled, true);
      assert.ok(!f.html().includes(failure));
    }
  }
});

test("late clipboard success/error cannot restore feedback after edits, translation or unmount", async () => {
  for (const action of [f => f.changeSource("New source"), f => f.click(), f => f.cleanup()]) {
    for (const outcome of ["resolve", "reject"]) {
      const f = fixture(translated);
      f.clickCopy();
      action(f);
      const updates = f.updates;
      f.clipboard[0][outcome](new Error("late denial"));
      await tick();
      assert.equal(f.updates, updates);
      assert.equal(f.timers.size, 0);
      assert.equal(f.copyButton().props.children, "Kopyala");
      assert.ok(!f.html().includes(failure));
    }
  }
});

test("out-of-order clipboard promises retain only the latest copy feedback", async () => {
  const f = fixture(translated);
  f.clickCopy();
  f.clickCopy();
  f.clipboard[1].resolve();
  await tick();
  f.clipboard[0].reject(new Error("obsolete error"));
  await tick();
  assert.equal(f.copyButton().props.children, "Kopyalandı");
  assert.equal(f.timers.size, 1);
  assert.ok(!f.html().includes(failure));
});

test("unmount cancels the copy feedback timer", async () => {
  const f = fixture(translated);
  await copied(f);
  f.cleanup();
  const updates = f.updates;
  assert.equal(f.timers.size, 0);
  f.advance(2000);
  assert.equal(f.updates, updates);
});
