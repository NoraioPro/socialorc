import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listSupportedLocales,
  localizeVariants,
  mockAdaptText,
} from "../../src/lib/localization";

describe("localization stub", () => {
  it("lists supported locales including rtl Arabic", () => {
    const locales = listSupportedLocales();
    assert.ok(locales.some((l) => l.code === "ar" && l.dir === "rtl"));
    assert.ok(locales.some((l) => l.code === "en"));
  });

  it("mockAdaptText marks non-English output as mock", () => {
    const out = mockAdaptText("Welcome to the launch today", "no");
    assert.match(out, /mock/i);
    assert.match(out, /velkommen/i);
    assert.match(out, /lansering/i);
  });

  it("localizeVariants skips en and never claims live API", () => {
    const result = localizeVariants("Welcome update today");
    assert.equal(result.sourceLocale, "en");
    assert.ok(result.variants.length >= 3);
    assert.ok(result.variants.every((v) => v.source === "mock"));
    assert.ok(!result.variants.some((v) => v.locale === "en"));
  });

  it("empty source yields empty variant texts", () => {
    const result = localizeVariants("   ", ["ar"]);
    assert.equal(result.sourceText, "");
    assert.equal(result.variants[0].text, "");
  });

  it("rtl locale keeps dir metadata", () => {
    const result = localizeVariants("launch", ["ar"]);
    assert.equal(result.variants[0].dir, "rtl");
  });
});
