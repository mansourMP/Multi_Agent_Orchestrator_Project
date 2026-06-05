import test from "node:test";
import assert from "node:assert/strict";

import { shouldRegisterFromPairingToken } from "../index";

test("startup consumes pairing token only when no gateway token exists", () => {
  assert.equal(shouldRegisterFromPairingToken("gpair_new", undefined, undefined), true);
  assert.equal(shouldRegisterFromPairingToken("gpair_used", "ggt_stored", undefined), false);
  assert.equal(shouldRegisterFromPairingToken("gpair_used", undefined, "ggt_explicit"), false);
  assert.equal(shouldRegisterFromPairingToken("", undefined, undefined), false);
});
