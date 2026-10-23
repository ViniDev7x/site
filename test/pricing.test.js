import test from "node:test";
import assert from "node:assert/strict";
import { quote, TABLE } from "../shared/pricing.js";
test("integer-cent pricing: hardware factors, addons, cycle discount and one-time template", () => {
  const q = quote({
    category: "Jogos",
    ram: 4,
    cpu: 2,
    disk: 40,
    region: "São Paulo, BR",
    cycle: "annual",
    addons: { ip: 1, backup: 1 },
    template: "survival",
  });
  assert.deepEqual(
    q.resourceLines.map((l) => l.cents),
    [3312, 2208, 1104],
  );
  assert.equal(q.monthly, 9104);
  assert.equal(q.discount, 21850);
  assert.equal(q.recurring, 87398);
  assert.equal(q.once, 1990);
  assert.equal(q.total, 89388);
  assert.equal(q.renewal, 87398);
});
test("CPU, disk, region, category, quantity and plan affect quote; recurring excludes template", () => {
  const base = quote({});
  for (const update of [
    { cpu: 3 },
    { disk: 60 },
    { region: "Miami, EUA" },
    { category: "Sites" },
    { addons: { slots: 2 } },
    { agency: "agency" },
  ])
    assert.notEqual(quote(update).total, base.total);
  assert.equal(quote({ addons: { slots: 2 } }).total - base.total, 1000);
  assert.equal(quote({ agency: "agency" }).total - base.total, 4990);
  const six = quote({ cycle: "semiannual" });
  assert.equal(six.discount, Math.round(base.total * 6 * 0.1));
  assert.equal(six.renewal, six.total);
});
test("markup within bounded range, no addon discount from regional factors", () => {
  const base = quote({ region: "Miami, EUA", addons: { ip: 1 } }, 25);
  assert.equal(
    base.marginCents,
    Math.round((4 * 600 * 1.2 + 2 * 800 * 1.2 + 40 * 20 * 1.2 + 1490) * 0.25),
  );
  assert.equal(base.addonLines[0].cents, 1490);
  for (const margin of [-1, 41, NaN]) assert.throws(() => quote({}, margin));
});
test("strict input validation prevents negative, nonfinite, unknown and cross-category addons", () => {
  for (const input of [
    { ram: 0 },
    { ram: 1.2 },
    { cpu: -1 },
    { disk: Infinity },
    { category: "__proto__" },
    { cycle: "weekly" },
    { addons: { ip: 99 } },
    { category: "Sites", addons: { slots: 1 } },
    { category: "Jogos", template: "portfolio" },
  ])
    assert.throws(() => quote(input));
  assert.equal(
    quote({ ram: 8, cpu: 4, disk: 100 }).requiresVerification,
    false,
  );
  for (const input of [{ ram: 9 }, { cpu: 5 }, { disk: 101 }])
    assert.equal(quote(input).requiresVerification, true);
});
