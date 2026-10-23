import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApplication } from "../server/app.js";
import { quote } from "../shared/pricing.js";
import { scanUpload, Limiter } from "../server/security.js";
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "nexora-test-"));
  const app = createApplication({
    dataDir: dir,
    adminToken: "test-admin-only",
    jobInterval: 1e8,
    ...options,
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  function client() {
    let cookie = "";
    return async (path, method = "GET", body, headers = {}) => {
      const r = await fetch(base + "/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const c = r.headers.get("set-cookie");
      if (c) cookie = c.split(";")[0];
      return {
        status: r.status,
        data: r.headers.get("content-type")?.includes("json")
          ? await r.json()
          : Buffer.from(await r.arrayBuffer()),
      };
    };
  }
  return { app, client, dir };
}
function order(input = {}) {
  const specs = {
    category: "Sites",
    ram: 2,
    cpu: 1,
    disk: 20,
    subtype: "Next.js",
    ...input,
  };
  const q = quote(specs);
  return {
    ...specs,
    name: "Projeto de teste",
    requestId: randomUUID(),
    acceptedPolicy: "2026-10-v1",
    paymentMode: "demo",
    expectedTotal: q.total,
    priceVersion: q.version,
  };
}

test("authenticated owner boundaries, CSRF, admin boundaries, authoritative prices and idempotent provision jobs", async (t) => {
  const { app, client } = await setup(t);
  const a = client(),
    b = client();
  assert.equal((await a("/services")).status, 401);
  const userA = (await a("/session", "POST", {})).data.user;
  await b("/session", "POST", {});
  const service = (await a("/services")).data[0];
  assert.equal((await b(`/services/${service.id}`)).status, 404);
  assert.equal(
    (await b(`/services/${service.id}/onboarding`, "PATCH", { tourSeen: true }))
      .status,
    404,
  );
  assert.equal((await a("/admin/overview")).status, 403);
  assert.equal(
    (
      await a("/admin/verify", "POST", {
        userId: userA.id,
        identityVerified: true,
        paymentVerified: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (await a("/quote", "POST", {}, { Origin: "https://evil.example" })).status,
    403,
  );
  const input = order();
  assert.equal(
    (await a("/orders", "POST", { ...input, expectedTotal: 1 })).status,
    409,
  );
  assert.equal(
    (await a("/orders", "POST", { ...input, acceptedPolicy: null })).status,
    400,
  );
  assert.equal(
    (await a("/orders", "POST", { ...input, paymentMode: "stripe" })).status,
    503,
  );
  const response = await a("/orders", "POST", input);
  assert.equal(response.status, 201);
  const job = response.data.job;
  const again = await a("/orders", "POST", input);
  assert.equal(again.status, 200);
  assert.equal(again.data.job.id, job.id);
  assert.equal(app.store.all("invoices").length, 1);
  assert.equal((await b(`/jobs/${job.id}`)).status, 404);
  for (let i = 0; i < 4; i++) app.tickJobs();
  const completed = (await a(`/jobs/${job.id}`)).data;
  assert.equal(completed.status, "completed");
  assert.equal(completed.progress, 100);
  const created = (await a(`/services/${completed.serviceId}`)).data;
  assert.equal(created.quote.total, input.expectedTotal);
  assert.equal(created.onboarding.tourSeen, false);
  assert.equal(created.isolation.privileged, false);
  assert.deepEqual(created.isolation.capDrop, ["ALL"]);
  assert.equal(created.isolation.published, false);
  const updated = await a(`/services/${created.id}/onboarding`, "PATCH", {
    tourSeen: true,
    step: "backup",
    done: true,
  });
  assert.equal(updated.data.onboarding.steps.backup, true);
  assert.equal(
    (
      await a(`/services/${created.id}/onboarding`, "PATCH", {
        step: "bypass",
        done: true,
      })
    ).status,
    400,
  );
  assert.ok(
    (await a("/notifications")).data.some(
      (n) => n.title === "Seu serviço está pronto",
    ),
  );
});

test("high resource verification, rollback on revoked verification, abuse suspension and audit-backed review", async (t) => {
  const { app, client } = await setup(t);
  const customer = client(),
    admin = client();
  const user = (await customer("/session", "POST", {})).data.user;
  await admin("/session", "POST", {});
  assert.equal(
    (await admin("/admin/session", "POST", { token: "wrong" })).status,
    403,
  );
  assert.equal(
    (await admin("/admin/session", "POST", { token: "test-admin-only" }))
      .status,
    200,
  );
  const input = order({ ram: 16 });
  assert.equal((await customer("/orders", "POST", input)).status, 403);
  const verification = {
    userId: user.id,
    reference: "KYC-test-reference",
    identityVerified: true,
    paymentVerified: true,
  };
  assert.equal(
    (await admin("/admin/verify", "POST", verification)).status,
    200,
  );
  const res = await customer("/orders", "POST", input);
  assert.equal(res.status, 201);
  await admin("/admin/verify", "POST", {
    ...verification,
    paymentVerified: false,
  });
  app.tickJobs();
  const failed = (await customer(`/jobs/${res.data.job.id}`)).data;
  assert.equal(failed.status, "failed");
  assert.equal(failed.rolledBack, true);
  assert.equal(app.store.get("services", failed.serviceId), null);
  const service = (await customer("/services")).data[0];
  assert.equal(
    (await customer("/admin/telemetry", "POST", { serviceId: service.id }))
      .status,
    403,
  );
  const abuse = await admin("/admin/telemetry", "POST", {
    serviceId: service.id,
    connectionsPerMinute: 6000,
    smtpAttempts: 0,
    abuseReports: 0,
  });
  assert.equal(abuse.data.suspended, true);
  assert.equal(
    (
      await customer(`/services/${service.id}/action`, "POST", {
        action: "start",
      })
    ).status,
    403,
  );
  assert.ok(
    (await customer("/notifications")).data.some((n) =>
      n.title.includes("suspenso"),
    ),
  );
  assert.equal(
    (
      await admin("/admin/unsuspend", "POST", {
        serviceId: service.id,
        reason: "Revisão da evidência concluída",
      })
    ).status,
    200,
  );
  assert.equal(
    (await customer(`/services/${service.id}`)).data.status,
    "Offline",
  );
  assert.equal(app.store.all("audit").length, 2);
});

test("affiliates: validation, self-referral rejection, paid-plan markup and nonwithdrawable demo commissions", async (t) => {
  const { app, client } = await setup(t);
  const seller = client(),
    buyer = client();
  const sellerUser = (await seller("/session", "POST", {})).data.user;
  await buyer("/session", "POST", {});
  const form = {
    name: "Clan Test",
    color: "#554499",
    logo: "",
    domain: "hospedagem.clan.example",
    plan: "reseller",
    margin: 30,
  };
  assert.equal(
    (await seller("/affiliate", "PUT", { ...form, margin: 41 })).status,
    400,
  );
  assert.equal(
    (await seller("/affiliate", "PUT", { ...form, color: "red;display:none" }))
      .status,
    400,
  );
  const affiliate = (await seller("/affiliate", "PUT", form)).data;
  assert.equal(affiliate.planActive, false);
  assert.equal(
    (
      await seller("/quote", "POST", {
        ...order(),
        referralCode: affiliate.code,
      })
    ).status,
    400,
  );
  let price = (
    await buyer("/quote", "POST", { ...order(), referralCode: affiliate.code })
  ).data;
  assert.equal(price.margin, 0);
  await seller("/orders", "POST", order({ agency: "reseller" }));
  assert.equal((await seller("/affiliate")).data.affiliate.planActive, true);
  price = (
    await buyer("/quote", "POST", { ...order(), referralCode: affiliate.code })
  ).data;
  assert.equal(price.margin, 30);
  const input = {
    ...order(),
    referralCode: affiliate.code,
    expectedTotal: price.total,
  };
  const created = await buyer("/orders", "POST", input);
  assert.equal(created.status, 201);
  await buyer("/orders", "POST", input);
  const stats = (await seller("/affiliate")).data;
  assert.equal(stats.commissions.length, 1);
  assert.equal(stats.referredCustomers, 1);
  assert.equal(stats.commissions[0].status, "demo");
  assert.equal(stats.commissions[0].cents, price.marginCents);
  assert.equal((await seller("/affiliate/connect", "POST", {})).status, 503);
  assert.equal((await buyer("/affiliate")).data.commissions.length, 0);
  assert.equal(app.store.all("payouts").length, 0);
});

test("uploads fail closed without scanner and unscanned artifacts cannot provision; scanner result codes are distinct", async (t) => {
  const { client, app, dir } = await setup(t, {
    scanner: "/not-installed/clamscan",
  });
  const a = client();
  const user = (await a("/session", "POST", {})).data.user;
  const rejected = await a("/uploads", "POST", {
    filename: "bot.js",
    content: Buffer.from('console.log("ok")').toString("base64"),
  });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.data.status, "scanner-unavailable");
  assert.deepEqual(await readdir(join(dir, "quarantine")), []);
  assert.equal(
    (await a("/orders", "POST", order({ uploadId: rejected.data.id }))).status,
    422,
  );
  const scanner = join(dir, "scanner-fixture");
  await writeFile(scanner, "#!/bin/sh\nexit 0\n");
  await chmod(scanner, 0o700);
  const clean = await scanUpload({
    dataDir: dir,
    filename: "site.html",
    content: Buffer.from("<h1>Test</h1>").toString("base64"),
    scanner,
  });
  assert.equal(clean.status, "clean");
  await writeFile(scanner, "#!/bin/sh\nexit 1\n");
  const infected = await scanUpload({
    dataDir: dir,
    filename: "site.html",
    content: Buffer.from("test").toString("base64"),
    scanner,
  });
  assert.equal(infected.status, "infected");
  assert.equal(
    (
      await a("/uploads", "POST", {
        filename: "../../evil.exe",
        content: "dGVzdA==",
      })
    ).status,
    400,
  );
});

test("rate limits apply independently to public IP and authenticated account", async (t) => {
  const { client } = await setup(t, { accountLimit: 2, ipLimit: 50 });
  const a = client();
  await a("/session", "POST", {});
  assert.equal((await a("/services")).status, 200);
  assert.equal((await a("/services")).status, 200);
  assert.equal((await a("/services")).status, 429);
  const limiter = new Limiter();
  assert.equal(limiter.allow("ip:a", 1, 100), true);
  assert.equal(limiter.allow("ip:a", 1, 101), false);
  assert.equal(limiter.allow("ip:b", 1, 101), true);
  assert.equal(limiter.allow("ip:a", 1, 60101), true);
});

test("existing-service add-ons require explicit confirmed quote, persist invoice and replay safely", async (t) => {
  const { app, client } = await setup(t);
  const a = client();
  await a("/session", "POST", {});
  const service = (await a("/services")).data[0];
  const preview = await a(`/services/${service.id}/addons`, "POST", {
    addons: { backup: 1 },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.chargeCents, 990);
  assert.equal(
    (await a(`/services/${service.id}`)).data.quote.specs.addons.backup,
    undefined,
  );
  const confirmation = {
    addons: { backup: 1 },
    confirm: true,
    paymentMode: "demo",
    requestId: randomUUID(),
    expectedCharge: 990,
    previousTotal: preview.data.previousTotal,
  };
  assert.equal(
    (
      await a(`/services/${service.id}/addons`, "POST", {
        ...confirmation,
        expectedCharge: 1,
      })
    ).status,
    409,
  );
  const result = await a(
    `/services/${service.id}/addons`,
    "POST",
    confirmation,
  );
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.service.quote.specs.addons.backup, 1);
  const replay = await a(
    `/services/${service.id}/addons`,
    "POST",
    confirmation,
  );
  assert.equal(replay.status, 200);
  assert.equal(app.store.all("invoices").length, 1);
  assert.equal(app.store.all("jobs").length, 0);
  assert.equal(app.store.all("invoices")[0].total, 990);
  assert.equal(
    (
      await a(`/services/${service.id}/addons`, "POST", {
        addons: { backup: 0 },
      })
    ).status,
    400,
  );
});

test("marketplace delivery is owner scoped and invitations/domain settings persist without granting access", async (t) => {
  const { app, client } = await setup(t);
  const a = client(),
    b = client();
  await a("/session", "POST", {});
  await b("/session", "POST", {});
  const input = order({ template: "portfolio", subtype: "Estático" });
  const result = await a("/orders", "POST", input);
  assert.equal(result.status, 201);
  for (let i = 0; i < 4; i++) app.tickJobs();
  const service = (await a(`/services/${result.data.job.serviceId}`)).data;
  const licenses = (await a("/licenses")).data;
  assert.equal(licenses.length, 1);
  assert.equal((await b("/licenses")).data.length, 0);
  assert.equal((await b(`/licenses/${licenses[0].id}/download`)).status, 404);
  const download = await a(`/licenses/${licenses[0].id}/download`);
  assert.equal(download.status, 200);
  assert.ok(Buffer.isBuffer(download.data));
  assert.equal(download.data.subarray(0, 2).toString(), "PK");
  const configured = await a(`/services/${service.id}/setup`, "PATCH", {
    address: "app.community.example",
  });
  assert.equal(configured.data.customAddress, "app.community.example");
  assert.equal(configured.data.domainStatus, "pending-infrastructure");
  const invite = await a(`/services/${service.id}/invitations`, "POST", {
    email: "player@example.com",
    role: "operator",
  });
  assert.equal(invite.status, 201);
  assert.equal(invite.data.status, "pending-email-integration");
  assert.equal(
    (
      await a(`/services/${service.id}/invitations`, "POST", {
        email: "player@example.com",
        role: "operator",
      })
    ).status,
    409,
  );
  assert.equal((await b(`/services/${service.id}/invitations`)).status, 404);
  assert.equal((await a(`/services/${service.id}/invitations`)).data.length, 1);
});
