/**
 * Per-account send destinations.
 *
 * The rule these protect: a send is addressed to the ACCOUNT's destination, and
 * an account with nothing stored must reach the adapter as "no destination" —
 * never as an empty string and never as a global fallback. Telegram made the
 * failure concrete: reading `process.env.TELEGRAM_CHAT_ID` sent every tenant's
 * posts into the deployment owner's private chat.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { destinationForAccount } from "../../src/lib/adapters/destination";

describe("destinationForAccount", () => {
  it("returns the account's chat id from metadata", () => {
    assert.deepEqual(destinationForAccount({ chatId: "-1001234567890" }), {
      chatId: "-1001234567890",
    });
  });

  it("ignores other metadata keys", () => {
    assert.deepEqual(
      destinationForAccount({ chatId: "42", tokenType: "bot", isBot: true }),
      { chatId: "42" },
    );
  });

  it("trims a padded id rather than sending the padding", () => {
    assert.deepEqual(destinationForAccount({ chatId: "  42  " }), { chatId: "42" });
  });

  it("accepts a numeric id and normalises it to a string", () => {
    assert.deepEqual(destinationForAccount({ chatId: 42 }), { chatId: "42" });
  });

  it("treats a blank id as absent, never as an empty target", () => {
    for (const chatId of ["", "   ", "\n"]) {
      assert.deepEqual(
        destinationForAccount({ chatId }),
        {},
        `${JSON.stringify(chatId)} must be absent, not an empty destination`,
      );
    }
  });

  it("treats missing, malformed or non-scalar metadata as absent", () => {
    const absent = [
      undefined,
      null,
      {},
      { chatId: null },
      { chatId: undefined },
      { chatId: Number.NaN },
      { chatId: Number.POSITIVE_INFINITY },
      { chatId: ["42"] },
      { chatId: { value: "42" } },
      { chatId: true },
      "not-an-object",
      42,
      [],
    ];

    for (const metadata of absent) {
      assert.deepEqual(
        destinationForAccount(metadata),
        {},
        `${JSON.stringify(metadata)} must resolve to no destination`,
      );
    }
  });

  it("never returns a key it was not given", () => {
    // Guards the shape the adapters read: an unexpected key would be silently
    // ignored at best and sent to a platform at worst.
    assert.deepEqual(Object.keys(destinationForAccount({ chatId: "7" })), ["chatId"]);
    assert.deepEqual(Object.keys(destinationForAccount({})), []);
  });
});
