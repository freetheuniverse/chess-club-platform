import test from "node:test";
import assert from "node:assert/strict";
import { makePassword, verifyPassword } from "../worker/index.js";

test("versioned salt and chained hash use supported Cloudflare-sized rounds", async () => {
  const stored = await makePassword("StrongPassphrase123!");
  assert.match(stored, /^pbkdf2-chain-v2:[a-f0-9]{32}:[a-f0-9]{64}$/);
  assert.equal(await verifyPassword("StrongPassphrase123!", stored), true);
  assert.equal(await verifyPassword("NotTheRightPassword", stored), false);
});

test("identical passwords use unique random salts", async () => {
  const first = await makePassword("SamePassword123!");
  const second = await makePassword("SamePassword123!");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("SamePassword123!", first), true);
  assert.equal(await verifyPassword("SamePassword123!", second), true);
});

test("invalid saved hashes fail safely", async () => {
  assert.equal(await verifyPassword("something", ""), false);
  assert.equal(await verifyPassword("something", "garbage"), false);
  assert.equal(await verifyPassword("something", "pbkdf2-chain-v2:notvalid:notvalid"), false);
});
