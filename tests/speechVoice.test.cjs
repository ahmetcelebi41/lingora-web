const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/components/translator/speechVoice.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const loaded = {};
new Function("exports", code)(loaded);
const { selectEnglishVoice } = loaded;
const voice = (lang, flags = {}) => ({ lang, default: false, localService: false, ...flags });

test("exact en-US outranks other English and non-English default voices", () => {
  const exact = voice("en-US");
  assert.equal(selectEnglishVoice([voice("tr-TR", { default: true }), voice("en-GB", { default: true }), exact]), exact);
  assert.equal(selectEnglishVoice([voice("en-us")]).lang, "en-us");
});

test("regional English fallback excludes non-English and similarly named language tags", () => {
  const english = voice("en-AU");
  assert.equal(selectEnglishVoice([voice("tr-TR"), voice("eng-US"), english]), english);
});

test("empty or non-English voice lists yield undefined for browser default fallback", () => {
  assert.equal(selectEnglishVoice([]), undefined);
  assert.equal(selectEnglishVoice([voice("tr-TR", { default: true }), voice("fr-FR")]), undefined);
});

test("same-language ties prefer default, then localService, then stable input order without mutation", () => {
  for (const lang of ["en-US", "en-GB"]) {
    const first = voice(lang);
    const local = voice(lang, { localService: true });
    const preferred = voice(lang, { default: true });
    const voices = Object.freeze([first, local, preferred]);
    assert.equal(selectEnglishVoice(voices), preferred);
    assert.equal(selectEnglishVoice([first, local]), local);
    assert.equal(selectEnglishVoice([first, voice(lang)]), first);
    assert.deepEqual(voices, [first, local, preferred]);
  }
});

test("English list preserves regional entries, puts en-US first and does not mutate input", () => {
  const gb = voice("en-GB");
  const us = voice("en-US");
  const au = voice("en-AU");
  const input = Object.freeze([gb, voice("tr-TR"), us, voice("eng-US"), au]);
  assert.deepEqual(loaded.listEnglishVoices(input), [us, gb, au]);
  assert.deepEqual(loaded.listEnglishVoices([gb, au]), [gb, au]);
  assert.deepEqual(loaded.listEnglishVoices([]), []);
});
