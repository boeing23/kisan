import { test } from "node:test";
import assert from "node:assert/strict";
import { adviseFertilization, daysAfterSowing } from "./fertilization.js";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

test("no advice without crop or sowing date", () => {
  assert.equal(adviseFertilization(undefined, daysAgo(0)).due, false);
  assert.equal(adviseFertilization("cotton", undefined).due, false);
});

test("basal dose due at sowing", () => {
  const a = adviseFertilization("cotton", daysAgo(0));
  assert.equal(a.due, true);
  assert.equal(a.action, "basal");
});

test("first top-dressing due ~30 days for cotton", () => {
  const a = adviseFertilization("cotton", daysAgo(30));
  assert.equal(a.due, true);
  assert.equal(a.action, "top_dress_1");
});

test("nothing due between scheduled events", () => {
  const a = adviseFertilization("cotton", daysAgo(15));
  assert.equal(a.due, false);
});

test("unknown crop yields no schedule", () => {
  assert.equal(adviseFertilization("dragonfruit", daysAgo(0)).due, false);
});

test("daysAfterSowing counts whole days", () => {
  assert.equal(daysAfterSowing(daysAgo(10)), 10);
});
