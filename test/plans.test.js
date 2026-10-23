import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApplication } from "../server/app.js";
import { quote } from "../shared/pricing.js";
import { PLANS, planSpecs } from "../shared/plans.js";
import { couponService } from "../server/coupons.js";
import { createStore } from "../server/store.js";
const cpf = "529.982.247-25",
  secondCpf = "111.444.777-35"; // Public synthetic test identities, never customer data.
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "nexora-plans-"));
  let clock = Date.now();
  const app = createApplication({
    dataDir: dir,
    adminToken: "admin-fixture",
    jobInterval: 1e8,
    clock: () => clock,
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  function client() {
    let cookie = "";
    return async (path, method = "GET", input) => {
      const r = await fetch(
        `http://127.0.0.1:${app.server.address().port}/api` + path,
        {
          method,
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: input === undefined ? undefined : JSON.stringify(input),
        },
      );
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      return { status: r.status, data: await r.json() };
    };
  }
  const finish = async () => {
    for (let i = 0; i < 5; i++) {
      app.tickJobs();
      await new Promise((r) => setImmediate(r));
    }
  };
  return {
    app,
    client,
    finish,
    advance: (days) => {
      clock += days * 86400000;
    },
  };
}
const request = (plan, extra = {}) => {
  const specs = {
      ...planSpecs(plan),
      category: "Sites",
      subtype: "Estático",
      ...extra,
    },
    q = quote(specs);
  return {
    ...specs,
    name: "Projeto Free",
    cpf: extra.cpf ?? cpf,
    freeEmail: extra.freeEmail ?? "free@example.com",
    requestId: randomUUID(),
    paymentMode: plan === "free" ? "free" : "demo",
    acceptedPolicy: "2026-10-v1",
    expectedTotal: q.total,
    priceVersion: q.version,
  };
};
const coupon = (extra = {}) => ({
  code: "COMUNIDADE",
  type: "percent",
  value: 20,
  plans: ["starter", "plus", "pro", "elite"],
  maxUses: 100,
  oncePerAccount: true,
  active: true,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  attribution: "community-fixture",
  ...extra,
});

test("plan resource ratios, Free zero pricing and paid custom Elite are authoritative", () => {
  for (const [id, p] of Object.entries(PLANS)) {
    const q = quote({ plan: id });
    assert.equal(q.specs.ram, p.ram);
    assert.equal(q.specs.cpu, p.cpu);
    assert.equal(q.specs.disk, p.disk);
    assert.equal(q.total === 0, id === "free");
  }
  const elite = quote({ ...planSpecs("elite", 64) });
  assert.equal(elite.specs.cpu, 32);
  assert.equal(elite.specs.disk, 640);
  assert.throws(() => quote({ plan: "free", ram: 64 }));
  assert.throws(() => quote({ plan: "free", addons: { ip: 1 } }));
  assert.throws(() => quote({ plan: "free", cycle: "annual" }));
  assert.throws(() => quote({ plan: "elite", ram: 31 }));
  assert.throws(() => quote({ plan: "plus", cpu: 1 }));
  assert.equal(quote({ plan: "free" }).entitlements.automaticBackup, false);
});

test("Free bypasses billing, reserves identity atomically and blocks duplicate account/CPF/email/card claims", async (t) => {
  const { app, client, finish } = await fixture(t),
    a = client(),
    b = client();
  const ua = (await a("/session", "POST", {})).data.user;
  await b("/session", "POST", {});
  assert.equal(
    (await a("/orders", "POST", request("free", { cpf: "00000000000" })))
      .status,
    400,
  );
  assert.equal(app.store.all("freeClaims").length, 0);
  const input = request("free");
  const result = await a("/orders", "POST", input);
  assert.equal(result.status, 201);
  assert.equal(result.data.url, undefined);
  assert.equal(app.store.all("invoices").length, 0);
  const replay = await a("/orders", "POST", input);
  assert.equal(replay.data.job.id, result.data.job.id);
  assert.equal(
    (
      await a(
        "/orders",
        "POST",
        request("free", { cpf: secondCpf, freeEmail: "another@example.com" }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await b(
        "/orders",
        "POST",
        request("free", { freeEmail: "other@example.com" }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await b("/orders", "POST", request("free", { cpf: secondCpf }))).status,
    409,
  );
  assert.equal(app.store.all("orders").filter((o) => o.free).length, 1);
  assert.equal(
    JSON.stringify(app.store.all("freeClaims")).includes(
      cpf.replace(/\D/g, ""),
    ),
    false,
  );
  await finish();
  assert.equal(
    app.store
      .all("services")
      .filter((s) => s.ownerId === ua.id && s.quote.specs.plan === "free")
      .length,
    1,
  );
});

test("Free limits are server enforced; seven-day expiry hibernates without deleting and renewal restores access", async (t) => {
  const f = await fixture(t),
    c = f.client();
  await c("/session", "POST", {});
  const order = await c("/orders", "POST", request("free"));
  await f.finish();
  const id = order.data.job.serviceId;
  assert.equal(
    (
      await c(`/services/${id}/settings`, "PATCH", {
        customDomain: "example.com",
      })
    ).status,
    403,
  );
  assert.equal(
    (await c(`/services/${id}/settings`, "PATCH", { backupSchedule: "daily" }))
      .status,
    403,
  );
  // Sites have no player slots; game resource policy is tested separately below.
  assert.equal(
    (await c(`/services/${id}/settings`, "PATCH", { slots: 6 })).status,
    400,
  );
  assert.equal(
    (await c(`/services/${id}/setup`, "PATCH", { address: "example.com" }))
      .status,
    403,
  );
  assert.equal((await c(`/services/${id}/backups`, "POST", {})).status, 202);
  f.advance(8);
  await f.app.plans.lifecycle();
  assert.equal(f.app.store.get("services", id).status, "Hibernado");
  assert.equal(
    (await c(`/services/${id}/action`, "POST", { action: "start" })).status,
    403,
  );
  assert.equal((await c(`/services/${id}/renew-free`, "POST", {})).status, 200);
  assert.equal(
    (await c(`/services/${id}/action`, "POST", { action: "start" })).status,
    200,
  );
  assert.ok(f.app.store.get("services", id));
});

test("Free to paid upgrade preserves service identity, settings, address and data, and unlocks limits only after application", async (t) => {
  const { app, client, finish } = await fixture(t),
    c = client(),
    outsider = client();
  await c("/session", "POST", {});
  await outsider("/session", "POST", {});
  const free = await c("/orders", "POST", request("free"));
  await finish();
  const id = free.data.job.serviceId;
  const before = app.store.get("services", id);
  app.store.put("services", {
    ...before,
    privateDataMarker: "must survive",
    settings: { backupSchedule: "manual", customDomain: "", slots: 0 },
    onboarding: { steps: { connection: true } },
  });
  assert.equal(
    (
      await outsider(
        "/orders",
        "POST",
        request("starter", { upgradeServiceId: id }),
      )
    ).status,
    404,
  );
  const paid = await c(
    "/orders",
    "POST",
    request("starter", { upgradeServiceId: id }),
  );
  assert.equal(paid.status, 201);
  assert.equal(app.store.get("services", id).quote.specs.plan, "free");
  assert.equal(
    (
      await c(`/services/${id}/settings`, "PATCH", {
        customDomain: "example.com",
      })
    ).status,
    409,
  );
  await finish();
  const after = app.store.get("services", id);
  assert.equal(after.quote.specs.plan, "starter");
  assert.equal(after.id, before.id);
  assert.equal(after.address, before.address);
  assert.equal(after.privateDataMarker, "must survive");
  assert.equal(after.onboarding.steps.connection, true);
  assert.equal(after.entitlements.automaticBackup, true);
  assert.equal(after.freeTier, null);
  assert.equal(app.store.all("services").filter((s) => s.id === id).length, 1);
  assert.equal(
    (
      await c(`/services/${id}/settings`, "PATCH", {
        customDomain: "example.com",
        backupSchedule: "daily",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await c(
        "/orders",
        "POST",
        request("free", { cpf: secondCpf, freeEmail: "new@example.com" }),
      )
    ).status,
    409,
  );
});

test("coupon administration is protected; percent/fixed previews freeze at checkout and usage is per account", async (t) => {
  const { app, client } = await fixture(t),
    c = client();
  await c("/session", "POST", {});
  assert.equal((await c("/admin/coupons", "POST", coupon())).status, 403);
  await c("/admin/session", "POST", { token: "admin-fixture" });
  const created = await c("/admin/coupons", "POST", coupon());
  assert.equal(created.status, 201);
  const specs = {
    ...planSpecs("starter"),
    category: "Sites",
    couponCode: "comunidade",
  };
  const q = (await c("/quote", "POST", specs)).data;
  assert.equal(q.couponDiscount, Math.round(q.beforeCoupon * 0.2));
  const input = {
    ...request("starter"),
    couponCode: "COMUNIDADE",
    expectedTotal: q.total,
  };
  const order = await c("/orders", "POST", input);
  assert.equal(order.status, 201);
  assert.equal(order.data.order.quote.total, q.total);
  assert.equal((await c("/quote", "POST", specs)).status, 409);
  const report = (await c("/admin/coupons")).data;
  assert.equal(report.coupons[0].redeemed, 1);
  assert.equal(report.uses[0].ownerId, order.data.order.ownerId);
  assert.equal(report.uses[0].attribution, "community-fixture");
  const fixed = await c(
    "/admin/coupons",
    "POST",
    coupon({ code: "FIXO", type: "fixed", value: 1000, oncePerAccount: false }),
  );
  assert.equal(fixed.status, 201);
  assert.equal(
    (await c("/quote", "POST", { ...specs, couponCode: "FIXO" })).data
      .couponDiscount,
    1000,
  );
  assert.equal(
    (await c("/quote", "POST", { plan: "free", couponCode: "FIXO" })).status,
    400,
  );
  assert.equal(
    (await c("/admin/coupons/" + fixed.data.id, "PATCH", { active: false }))
      .status,
    200,
  );
  assert.equal(
    (await c("/quote", "POST", { ...specs, couponCode: "FIXO" })).status,
    400,
  );
});

test("coupon capacity includes concurrent reservations; expiry, plan and account restrictions cannot be bypassed", () => {
  const store = createStore(":memory:");
  try {
    const coupons = couponService({ store });
    const c = coupons.save(coupon({ maxUses: 1 }));
    const base = quote({ plan: "starter" });
    const q = coupons.apply(base, c.code, "first");
    coupons.reserve({ id: "pending", ownerId: "first", quote: q });
    assert.throws(() => coupons.apply(base, c.code, "second"), /limite/);
    coupons.release("pending");
    assert.ok(coupons.apply(base, c.code, "second"));
    coupons.save({ active: false }, c.id);
    assert.throws(() => coupons.apply(base, c.code, "second"), /desativado/);
    const exp = coupons.save(
      coupon({
        code: "EXPIRADO",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    assert.throws(() => coupons.apply(base, exp.code, "first"), /validade/);
    const restricted = coupons.save(
      coupon({ code: "SOELITE", plans: ["elite"] }),
    );
    assert.throws(() => coupons.apply(base, restricted.code, "first"), /plano/);
  } finally {
    store.close();
  }
});

test("parallel Free requests sharing CPF or verified card get only one claim; raw identities never enter orders", async (t) => {
  const { app, client } = await fixture(t),
    a = client(),
    b = client();
  const ua = (await a("/session", "POST", {})).data.user,
    ub = (await b("/session", "POST", {})).data.user;
  const result = await Promise.all([
    a("/orders", "POST", request("free", { freeEmail: "one@example.com" })),
    b("/orders", "POST", request("free", { freeEmail: "two@example.com" })),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
  const winner = result[0].status === 201 ? ua : ub,
    loser = winner.id === ua.id ? ub : ua;
  assert.equal(
    JSON.stringify(app.store.all("orders")).includes("529.982.247-25"),
    false,
  );
  const c = client(),
    d = client(),
    uc = (await c("/session", "POST", {})).data.user,
    ud = (await d("/session", "POST", {})).data.user;
  app.store.put("users", {
    ...uc,
    verifiedCardFingerprint: "gateway-fixture-card",
  });
  app.store.put("users", {
    ...ud,
    verifiedCardFingerprint: "gateway-fixture-card",
  });
  assert.equal(
    (
      await c(
        "/orders",
        "POST",
        request("free", { cpf: secondCpf, freeEmail: "three@example.com" }),
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await d(
        "/orders",
        "POST",
        request("free", { cpf: "12345678909", freeEmail: "four@example.com" }),
      )
    ).status,
    409,
  );
  assert.equal("verifiedCardFingerprint" in (await c("/me")).data.user, false);
});

test("failed production resize never deletes or replaces the original Free service", async () => {
  const { servicePlans } = await import("../server/service-plans.js");
  const store = createStore(":memory:");
  let deletes = 0;
  try {
    const original = {
      id: "service",
      ownerId: "owner",
      name: "Files",
      quote: quote({ plan: "free" }),
      address: "keep.example.com",
      settings: { backupSchedule: "manual" },
      privateFiles: ["keep-me"],
    };
    store.put("services", original);
    const order = {
      id: "upgrade",
      ownerId: "owner",
      status: "paid",
      live: true,
      name: "Files",
      quote: quote({ plan: "starter" }),
    };
    store.put("orders", order);
    const plans = servicePlans({
      store,
      config: { production: true, appKey: "a".repeat(64) },
      provider: {
        resize: async () => {
          throw Error("provider unavailable");
        },
        remove: async () => {
          deletes++;
        },
      },
      notify: () => {},
    });
    let job = {
      id: "job",
      serviceId: "service",
      orderId: "upgrade",
      kind: "upgrade",
      status: "queued",
    };
    store.put("jobs", job);
    for (let i = 0; i < 4; i++) {
      await plans.upgradeTick(job, order);
      job = store.get("jobs", "job");
    }
    assert.equal(job.status, "failed");
    assert.deepEqual(store.get("services", "service"), original);
    assert.equal(deletes, 0);
  } finally {
    store.close();
  }
});

test("a verified Stripe card fingerprint is pseudonymized and linked to an existing Free redemption", async (t) => {
  const { app, client } = await fixture(t),
    c = client(),
    d = client();
  const owner = (await c("/session", "POST", {})).data.user;
  await c("/orders", "POST", request("free"));
  app.plans.linkCard(owner.id, "card_verified_gateway_fixture");
  const user = app.store.get("users", owner.id);
  assert.notEqual(
    user.verifiedCardFingerprint,
    "card_verified_gateway_fixture",
  );
  assert.ok(app.store.all("freeClaims").some((c) => c.type === "card"));
  const other = (await d("/session", "POST", {})).data.user;
  app.plans.linkCard(other.id, "card_verified_gateway_fixture");
  assert.equal(
    (
      await d(
        "/orders",
        "POST",
        request("free", {
          cpf: secondCpf,
          freeEmail: "other-card@example.com",
        }),
      )
    ).status,
    409,
  );
});
