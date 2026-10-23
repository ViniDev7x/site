import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import Stripe from "stripe";
import { Resend } from "resend";
import { createApplication } from "../server/app.js";
import { loadRuntime, configIssues, LEGAL_VERSION } from "../server/runtime.js";
import { decryptBackup, encryptBackup } from "../server/backup.js";
import { quote } from "../shared/pricing.js";
const gatewaySecret = "whsec_only_a_unit_test_fixture";
const emailSecret =
  "whsec_" +
  Buffer.from("unit-test-signing-key-not-a-real-secret").toString("base64");
async function setup(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "nexora-production-test-"));
  await mkdir(join(dir, "dist"));
  await writeFile(
    join(dir, "dist/index.html"),
    '<html lang="pt-BR"><title>Nexora fixture</title><body>Beta</body></html>',
  );
  const config = loadRuntime(
    {},
    {
      production: true,
      dataDir: dir,
      origin: "https://launch.example",
      operator: "Operador de Teste",
      taxId: "11.222.333/0001-81",
      address: "Endereço fictício exclusivo de teste",
      supportEmail: "support@example.com",
      privacyEmail: "privacy@example.com",
      appKey: "1".repeat(64),
      backupKey: "2".repeat(64),
      adminToken: "unit-admin-token-".repeat(3),
      adminEmails: ["owner@example.com"],
      launchTestEmail: "owner@example.com",
      publicCheckout: false,
      stripeKey: "sk_live_unit_fixture_not_real",
      stripeWebhook: gatewaySecret,
      resendKey: "re_unit_fixture",
      resendWebhook: emailSecret,
      mailFrom: "Nexora <no-reply@example.com>",
      backupBucket: "unit-test-only",
      backupRegion: "us-east-1",
      provisionerUrl: "https://provider.example",
      provisionerToken: "unit-provider-fixture",
      ...overrides,
    },
  );
  const sent = [];
  const objects = new Map();
  const calls = [];
  const sdk = new Stripe("sk_test_unit");
  let lastCheckout;
  const gateway = {
    webhooks: sdk.webhooks,
    accounts: {
      retrieve: async () => ({
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
    },
    checkout: {
      sessions: {
        create: async (payload, options) => {
          lastCheckout = payload;
          calls.push({ type: "checkout", payload, options });
          return {
            id: "cs_live_fixture",
            url: "https://checkout.stripe.com/c/pay/fixture",
          };
        },
      },
    },
    subscriptions: {
      retrieve: async () => ({
        metadata: { orderId: lastCheckout?.client_reference_id },
        customer: "cus_fixture",
      }),
      update: async (id, payload) => {
        calls.push({ type: "cancel", id, payload });
        return { id, ...payload };
      },
    },
  };
  const realMail = new Resend("re_fixture_only");
  const mailClient = {
    webhooks: realMail.webhooks,
    domains: {
      list: async () => ({
        data: { data: [{ name: "example.com", status: "verified" }] },
      }),
    },
    emails: {
      send: async (payload, options) => {
        const id = "email_" + (sent.length + 1);
        sent.push({ id, payload, options });
        return { data: { id } };
      },
    },
  };
  const s3 = {
    send: async (command) => {
      if (command.constructor.name === "PutObjectCommand") {
        objects.set(command.input.Key, command.input);
        return {};
      }
      const obj = objects.get(command.input.Key);
      return { ContentLength: obj.Body.length, Metadata: obj.Metadata };
    },
  };
  let serviceId;
  let app;
  let base;
  let address = "service.unit.example:25565";
  let resources;
  let configurationId;
  const provisionerFetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    calls.push({
      type: "provisioner",
      path,
      method: options.method,
      body: options.body,
    });
    if (path === "/v1/health")
      return new Response(
        JSON.stringify({
          ready: true,
          mode: "production",
          isolationEnforced: true,
          freeTier: true,
          policiesEnforced: true,
          supportsResize: true,
          features: { settings: true, backups: true },
          categories: ["Sites"],
          types: { Sites: ["Estático", "Next.js"] },
          regions: ["São Paulo, BR"],
          limits: { ram: 8, cpu: 4, disk: 100 },
        }),
      );
    if (path === "/v1/services" && options.method === "POST") {
      const b = JSON.parse(options.body);
      serviceId = b.id;
      address = b.platformHostname || "service.unit.example:25565";
      resources = b.resources;
      return new Response(
        JSON.stringify({ id: serviceId, status: "provisioning" }),
      );
    }
    if (options.method === "PATCH" && path.endsWith("/resources")) {
      const b = JSON.parse(options.body);
      resources = b.resources;
      configurationId = b.configurationId;
      return new Response(JSON.stringify({ accepted: true }));
    }
    if (options.method === "DELETE")
      return new Response(JSON.stringify({ deleted: true }));
    if (options.method === "POST" && path.endsWith("/actions"))
      return new Response(JSON.stringify({ status: "stopped" }));
    return new Response(
      JSON.stringify({
        id: serviceId,
        status: "ready",
        address,
        resources,
        configurationId,
        metrics: { cpuPercent: 7, ramGB: 0.5, diskGB: 1 },
      }),
    );
  };
  app = createApplication({
    production: true,
    runtime: config,
    dataDir: dir,
    distDir: join(dir, "dist"),
    stripeClient: gateway,
    mailClient,
    s3,
    provisionerFetch,
    jobInterval: 1e8,
    background: false,
    fetchPublic: () => fetch(base + "/api/health"),
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  function client() {
    let cookie = "";
    return async (path, method = "GET", value, headers = {}) => {
      const r = await fetch(base + path, {
        method,
        headers: {
          Cookie: cookie,
          Origin: config.origin,
          "Content-Type": "application/json",
          ...headers,
        },
        body: value === undefined ? undefined : JSON.stringify(value),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      const data = r.headers.get("content-type")?.includes("json")
        ? await r.json()
        : await r.text();
      return { status: r.status, data, headers: r.headers };
    };
  }
  const tokenFrom = (message) =>
    new URL(message.payload.text.match(/https:\/\/[^\s]+/)[0]).searchParams.get(
      "token",
    );
  async function registerAndLogin(c, email = "owner@example.com") {
    assert.equal(
      (
        await c("/api/auth/register", "POST", {
          name: "Pessoa Teste",
          email,
          password: "senha-forte-exclusiva-123",
          acceptedTerms: true,
          legalVersion: LEGAL_VERSION,
        })
      ).status,
      200,
    );
    await app.mail.flush();
    const verification = sent.find(
      (s) => s.payload.to === email && s.payload.subject.includes("Confirme"),
    );
    const token = tokenFrom(verification);
    assert.equal((await c("/api/auth/verify", "POST", { token })).status, 200);
    const login = await c("/api/auth/login", "POST", {
      email,
      password: "senha-forte-exclusiva-123",
    });
    assert.equal(login.status, 200);
    return login;
  }
  async function emailDelivered(id, eventType = "email.delivered") {
    const raw = {
      type: eventType,
      created_at: new Date().toISOString(),
      data: { email_id: id },
    };
    const payload = JSON.stringify(raw);
    const eventId = "msg_" + randomUUID();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac(
      "sha256",
      Buffer.from(emailSecret.slice(6), "base64"),
    )
      .update(`${eventId}.${timestamp}.${payload}`)
      .digest("base64");
    return app.mail.webhook(Buffer.from(payload), {
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": "v1," + signature,
    });
  }
  async function stripeEvent(c, type, object, id = randomUUID(), live = true) {
    const event = { id, type, livemode: live, data: { object } };
    const raw = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: gatewaySecret,
    });
    return c("/api/billing/webhook", "POST", event, {
      "stripe-signature": signature,
    });
  }
  return {
    app,
    config,
    dir,
    base,
    client,
    sent,
    objects,
    calls,
    registerAndLogin,
    tokenFrom,
    emailDelivered,
    stripeEvent,
  };
}

test("production config separates test/live, rejects missing legal/security values and does not bootstrap anonymous accounts", async (t) => {
  assert.ok(
    configIssues(loadRuntime({ NODE_ENV: "production" })).some((i) =>
      i.includes("APP_ORIGIN"),
    ),
  );
  const f = await setup(t);
  assert.deepEqual(configIssues(f.config), []);
  assert.ok(
    configIssues({
      ...f.config,
      stripeKey: "sk_test_wrong_environment",
    }).includes("STRIPE_SECRET_KEY (live, nunca test em produção)"),
  );
  const c = f.client();
  const session = await c("/api/session", "POST", {});
  assert.equal(session.data.user, null);
  assert.equal(f.app.store.all("users").length, 0);
  assert.equal((await c("/api/services")).status, 401);
  const cfg = await c("/api/public/config");
  assert.equal(cfg.data.beta, true);
  assert.equal(cfg.data.production, true);
  assert.equal(cfg.data.features.ai, false);
  assert.equal(JSON.stringify(cfg.data).includes(f.config.appKey), false);
  const missing = await c("/missing-page");
  assert.equal(missing.status, 404);
  assert.match(missing.data, /Este endereço não existe/);
  assert.equal((await c("/.env.production")).status, 404);
  const page = await c("/termos");
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  const original = f.app.store.db.prepare.bind(f.app.store.db);
  f.app.store.db.prepare = () => {
    throw Error("SECRET_SQL_STACK");
  };
  const failure = await c("/api/health");
  f.app.store.db.prepare = original;
  assert.equal(failure.status, 500);
  assert.equal(
    JSON.stringify(failure.data).includes("SECRET_SQL_STACK"),
    false,
  );
});

test("registration verification, scrypt authentication, HttpOnly secure cookie, reset revocation and rate limits", async (t) => {
  const f = await setup(t);
  const c = f.client();
  assert.equal(
    (
      await c("/api/auth/register", "POST", {
        name: "A",
        email: "bad",
        password: "short",
      })
    ).status,
    400,
  );
  const login = await f.registerAndLogin(c);
  assert.match(
    login.headers.get("set-cookie"),
    /__Host-nexora_session=.*HttpOnly.*Secure/,
  );
  assert.equal("passwordHash" in login.data.user, false);
  const user = f.app.store.all("users")[0];
  assert.ok(user.passwordHash);
  assert.notEqual(user.passwordHash, "senha-forte-exclusiva-123");
  assert.equal(user.emailVerified, true);
  const verification = f.sent.find((s) =>
    s.payload.subject.includes("Confirme"),
  );
  assert.equal(
    (await c("/api/auth/verify", "POST", { token: f.tokenFrom(verification) }))
      .status,
    400,
  );
  const attacker = f.client();
  assert.equal(
    (
      await attacker("/api/auth/login", "POST", {
        email: "owner@example.com",
        password: "incorrect",
      })
    ).status,
    401,
  );
  assert.equal(
    (await c("/api/auth/forgot", "POST", { email: "owner@example.com" }))
      .status,
    200,
  );
  await f.app.mail.flush();
  const reset = f.sent.find((s) => s.payload.subject.includes("Redefinir"));
  assert.ok(reset);
  assert.equal(
    (
      await attacker("/api/auth/reset", "POST", {
        token: f.tokenFrom(reset),
        password: "outra-senha-forte-321",
      })
    ).status,
    200,
  );
  assert.equal((await c("/api/services")).status, 401);
  assert.equal(
    (
      await attacker("/api/auth/login", "POST", {
        email: "owner@example.com",
        password: "outra-senha-forte-321",
      })
    ).status,
    200,
  );
  assert.equal(
    JSON.stringify(f.app.store.all("mailOutbox")).includes("token="),
    false,
  );
  const oneTime = await attacker("/api/auth/reset", "POST", {
    token: f.tokenFrom(reset),
    password: "outra-senha-forte-321",
  });
  assert.equal(oneTime.status, 400);
});

test("rate limiting on public login does not trust arbitrary forwarded IP headers", async (t) => {
  const f = await setup(t);
  const c = f.client();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await c(
          "/api/auth/login",
          "POST",
          { email: "missing@example.com", password: "does-not-exist" },
          { "X-Forwarded-For": `203.0.113.${i}` },
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await c(
        "/api/auth/login",
        "POST",
        { email: "missing@example.com", password: "does-not-exist" },
        { "X-Forwarded-For": "198.51.100.77" },
      )
    ).status,
    429,
  );
});

test("online SQLite backup is encrypted, remotely verified and restorable, including corruption checks", async (t) => {
  const f = await setup(t);
  f.app.store.put("fixture", { id: "one", value: "important-platform-data" });
  await f.app.backups.run(true);
  const state = f.app.store.get("system", "backup");
  assert.equal(state.status, "ok");
  assert.equal(state.restoreVerified, true);
  assert.equal(f.app.backups.healthy(), true);
  const object = f.objects.get(state.objectKey);
  assert.ok(object);
  assert.equal(
    object.Body.includes(Buffer.from("important-platform-data")),
    false,
  );
  const restored = decryptBackup(object.Body, f.config.backupKey);
  assert.match(restored.subarray(0, 16).toString(), /SQLite format 3/);
  assert.throws(() => decryptBackup(object.Body, "3".repeat(64)));
  const tampered = Buffer.from(object.Body);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBackup(tampered, f.config.backupKey));
  const old = {
    ...state,
    createdAt: new Date(Date.now() - 27 * 3600000).toISOString(),
  };
  f.app.store.put("system", old);
  assert.equal(f.app.backups.healthy(), false);
});

test("controlled live flow (mocked providers): signup → login → signed paid invoice → real adapter → emails delivered → public gate", async (t) => {
  const f = await setup(t);
  const c = f.client();
  await f.registerAndLogin(c);
  await f.app.backups.run(true);
  await f.app.launch.probe();
  const q = quote({ category: "Sites", ram: 2, cpu: 1, disk: 20 });
  const input = {
    ...q.specs,
    name: "Production fixture site",
    subtype: "Estático",
    requestId: randomUUID(),
    acceptedPolicy: "2026-10-v1",
    acceptedLegalVersion: LEGAL_VERSION,
    paymentMode: "stripe",
    expectedTotal: q.total,
    priceVersion: q.version,
  };
  assert.equal(
    (await c("/api/orders", "POST", { ...input, paymentMode: "demo" })).status,
    400,
  );
  assert.equal(
    (await c("/api/orders", "POST", { ...input, expectedTotal: 1 })).status,
    409,
  );
  const checkout = await c("/api/orders", "POST", input);
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  assert.equal(f.app.store.all("jobs").length, 0);
  assert.equal(f.app.store.all("services").length, 0);
  assert.equal(
    f.calls.find((x) => x.type === "checkout").payload.customer_email,
    "owner@example.com",
  );
  const invoice = {
    id: "in_live_fixture",
    parent: { subscription_details: { subscription: "sub_live_fixture" } },
    currency: "brl",
    paid: true,
    billing_reason: "subscription_create",
    amount_paid: q.total,
  };
  assert.equal(
    (await f.stripeEvent(c, "invoice.paid", invoice, "evt_bad_mode", false))
      .status,
    400,
  );
  assert.equal(
    (await f.stripeEvent(c, "invoice.paid", invoice, "evt_live")).status,
    200,
  );
  assert.equal(
    (await f.stripeEvent(c, "invoice.paid", invoice, "evt_live")).status,
    200,
  );
  assert.equal(f.app.store.all("jobs").length, 1);
  await f.app.launch.tick();
  await f.app.launch.tick();
  const job = f.app.store.all("jobs")[0];
  assert.equal(job.status, "completed");
  const service = f.app.store.get("services", job.serviceId);
  assert.equal(service.demo, false);
  assert.equal(service.address, "service.unit.example:25565");
  assert.equal(
    (await c(`/api/services/${service.id}`)).data.metricsAvailable,
    true,
  );
  f.app.config.publicCheckout = true;
  assert.equal(f.app.launch.canCharge(service.ownerId), false);
  await f.app.mail.flush();
  for (const message of f.sent) await f.emailDelivered(message.id);
  await f.app.mail.flush();
  for (const message of f.sent) await f.emailDelivered(message.id);
  assert.equal(f.app.launch.status().proof, true);
  assert.equal(f.app.launch.canCharge(service.ownerId), true);
  assert.equal((await c("/api/affiliate")).status, 404);
  assert.equal((await c("/api/catalog")).status, 404);
  const cancel = await c(
    `/api/orders/${checkout.data.order.id}/cancel-renewal`,
    "POST",
    {},
  );
  assert.equal(cancel.status, 200);
  assert.equal(
    f.calls.find((x) => x.type === "cancel").payload.cancel_at_period_end,
    true,
  );
  assert.equal(
    (
      await f.stripeEvent(
        c,
        "customer.subscription.deleted",
        { id: "sub_live_fixture" },
        "evt_deleted",
      )
    ).status,
    200,
  );
  assert.equal(f.app.store.get("services", service.id).status, "Cancelado");
  assert.equal(
    (await c(`/api/services/${service.id}/action`, "POST", { action: "start" }))
      .status,
    403,
  );
  const outsider = f.client();
  await outsider("/api/session", "POST", {});
  assert.equal((await outsider(`/api/services/${service.id}`)).status, 401);
});

test("mail delivery webhook can precede provider response; invalid signatures never change delivery state", async (t) => {
  const f = await setup(t);
  const owner = { id: "mail-owner", email: "owner@example.com" };
  f.app.store.put("users", {
    ...owner,
    name: "Mail",
    passwordHash: "fixture",
    emailVerified: true,
  });
  f.app.mail.enqueue({
    id: "race-case",
    ownerId: owner.id,
    kind: "ready",
    to: owner.email,
    subject: "Ready",
    message: "Fixture",
  });
  await f.emailDelivered("email_1");
  await f.app.mail.flush();
  assert.equal(f.app.store.get("mailOutbox", "race-case").status, "delivered");
  await assert.rejects(
    f.app.mail.webhook(Buffer.from("{}"), {
      "svix-id": "bad",
      "svix-timestamp": "0",
      "svix-signature": "invalid",
    }),
    /Assinatura/,
  );
});

test("production Free provisions without Stripe readiness, then paid upgrade resizes the same service only after signed payment", async (t) => {
  const { planSpecs } = await import("../shared/plans.js");
  const f = await setup(t, { serviceDomain: "services.example.com" });
  const c = f.client();
  f.app.billing.stripe.paymentIntents = {
    retrieve: async () => ({
      payment_method: {
        card: { fingerprint: "verified-gateway-card-fixture" },
      },
    }),
  };
  await f.registerAndLogin(c);
  f.app.billing.stripe.accounts.retrieve = async () => ({
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
  });
  await f.app.backups.run(true);
  await f.app.launch.probe();
  const me = (await c("/api/me")).data;
  assert.equal(me.canCheckout, false);
  assert.equal(me.canStartFree, true);
  const specs = { ...planSpecs("free"), category: "Sites" };
  let q = quote(specs);
  const input = {
    ...specs,
    name: "Free de produção fixture",
    subtype: "Estático",
    cpf: "529.982.247-25",
    requestId: randomUUID(),
    paymentMode: "free",
    acceptedPolicy: "2026-10-v1",
    acceptedLegalVersion: LEGAL_VERSION,
    expectedTotal: q.total,
    priceVersion: q.version,
  };
  const free = await c("/api/orders", "POST", input);
  assert.equal(free.status, 201);
  assert.equal(f.calls.filter((x) => x.type === "checkout").length, 0);
  assert.equal(f.app.store.all("invoices").length, 0);
  await f.app.launch.tick();
  await f.app.launch.tick();
  const id = free.data.job.serviceId;
  const service = f.app.store.get("services", id);
  assert.equal(service.demo, false);
  assert.equal(
    service.address,
    `svc-${free.data.order.id}.services.example.com`,
  );
  assert.equal(service.quote.specs.plan, "free");
  const createPayload = JSON.parse(
    f.calls.find(
      (x) =>
        x.type === "provisioner" &&
        x.method === "POST" &&
        x.path === "/v1/services",
    ).body,
  );
  assert.equal(createPayload.policies.automaticBackup, false);
  assert.equal(createPayload.policies.customDomain, false);
  assert.ok(createPayload.freeRenewBy);
  f.app.store.put("services", {
    ...service,
    keepData: "important",
    settings: { backupSchedule: "manual", slots: 0 },
  });
  f.app.billing.stripe.accounts.retrieve = async () => ({
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
  });
  await f.app.launch.probe();
  const upgraded = { ...planSpecs("starter"), category: "Sites" };
  q = quote(upgraded);
  const paid = await c("/api/orders", "POST", {
    ...input,
    ...upgraded,
    paymentMode: "stripe",
    upgradeServiceId: id,
    requestId: randomUUID(),
    expectedTotal: q.total,
    priceVersion: q.version,
  });
  assert.equal(paid.status, 201);
  assert.equal(f.app.store.get("services", id).quote.specs.plan, "free");
  assert.equal(
    (
      await f.stripeEvent(c, "invoice.paid", {
        id: "in_upgrade",
        payment_intent: "pi_verified_fixture",
        subscription: "sub_upgrade",
        currency: "brl",
        paid: true,
        billing_reason: "subscription_create",
        amount_paid: q.total,
      })
    ).status,
    200,
  );
  await f.app.launch.tick();
  await f.app.launch.tick();
  const after = f.app.store.get("services", id);
  assert.equal(after.quote.specs.plan, "starter");
  assert.equal(after.address, service.address);
  assert.equal(after.keepData, "important");
  assert.equal(after.entitlements.customDomain, true);
  const fingerprint = f.app.store.get(
    "users",
    after.ownerId,
  ).verifiedCardFingerprint;
  assert.ok(fingerprint);
  assert.notEqual(fingerprint, "verified-gateway-card-fixture");
  assert.ok(f.app.store.all("freeClaims").some((c) => c.type === "card"));
  assert.equal(
    f.calls.filter(
      (x) =>
        x.type === "provisioner" &&
        x.path === "/v1/services" &&
        x.method === "POST",
    ).length,
    1,
  );
  assert.equal(f.calls.filter((x) => x.method === "DELETE").length, 0);
});

test("signed Stripe expiration releases coupon reservation; disabling a coupon preserves already agreed checkout price", async (t) => {
  const f = await setup(t);
  const c = f.client();
  await f.registerAndLogin(c);
  await f.app.backups.run(true);
  await f.app.launch.probe();
  const coupon = f.app.coupons.save({
    code: "STRIPE20",
    type: "percent",
    value: 20,
    plans: ["starter"],
    maxUses: 1,
    oncePerAccount: true,
    active: true,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const specs = { plan: "starter", category: "Sites" };
  const owner = f.app.store.all("users")[0];
  const q = f.app.coupons.apply(quote(specs), coupon.code, owner.id);
  const input = {
    ...specs,
    couponCode: coupon.code,
    name: "Cupom fixture",
    subtype: "Estático",
    requestId: randomUUID(),
    paymentMode: "stripe",
    acceptedPolicy: "2026-10-v1",
    acceptedLegalVersion: LEGAL_VERSION,
    expectedTotal: q.total,
    priceVersion: q.version,
  };
  const first = await c("/api/orders", "POST", input);
  assert.equal(first.status, 201);
  assert.equal(f.app.coupons.report().coupons[0].reserved, 1);
  assert.equal(
    (
      await f.stripeEvent(c, "checkout.session.expired", {
        id: "cs_live_fixture",
        client_reference_id: first.data.order.id,
      })
    ).status,
    200,
  );
  assert.equal(f.app.coupons.report().coupons[0].reserved, 0);
  const second = await c("/api/orders", "POST", {
    ...input,
    requestId: randomUUID(),
  });
  assert.equal(second.status, 201);
  f.app.coupons.save({ active: false }, coupon.id);
  assert.equal(
    (
      await f.stripeEvent(c, "invoice.paid", {
        id: "in_coupon",
        subscription: "sub_coupon",
        currency: "brl",
        paid: true,
        billing_reason: "subscription_create",
        amount_paid: q.total,
      })
    ).status,
    200,
  );
  assert.equal(f.app.coupons.report().coupons[0].redeemed, 1);
  assert.equal(
    f.app.store.get("orders", second.data.order.id).quote.total,
    q.total,
  );
});
