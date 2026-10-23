import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { billingProvider } from "../server/billing.js";
import { createStore } from "../server/store.js";
import { quote } from "../shared/pricing.js";
function setup(t) {
  const store = createStore(":memory:");
  t.after(() => store.close());
  const signingSecret = "whsec_unit_test";
  const sdk = new Stripe("sk_test_unit");
  let created = 0;
  const transfers = [];
  const mock = {
    webhooks: sdk.webhooks,
    subscriptions: {
      retrieve: async () => ({ metadata: { orderId: "order-1" } }),
    },
    checkout: {
      sessions: {
        create: async (payload, options) => ({
          id: "cs_test_1",
          url: "https://checkout.stripe.com/c/pay/test",
          payload,
          options,
        }),
      },
    },
    transfers: {
      list: ({ transfer_group }) => ({
        async *[Symbol.asyncIterator]() {
          for (const tr of transfers.filter(
            (tr) => tr.transfer_group === transfer_group,
          ))
            yield tr;
        },
      }),
      create: async (p) => {
        created++;
        const tr = { id: "tr_" + created, ...p };
        transfers.push(tr);
        return tr;
      },
    },
  };
  const queue = [];
  const notifications = [];
  const billing = billingProvider({
    store,
    key: "sk_test_unit",
    webhookSecret: signingSecret,
    origin: "https://test.example",
    stripeClient: mock,
    queue: (o) => queue.push(o.id),
    notify: (...args) => notifications.push(args),
  });
  const q = quote({ category: "Sites", template: "portfolio" });
  const order = {
    id: "order-1",
    ownerId: "customer-1",
    name: "Site",
    referrerId: "affiliate-1",
    quote: q,
    status: "awaiting-payment",
  };
  store.put("orders", order);
  store.put("affiliates", {
    id: "affiliate-1",
    stripeAccountId: "acct_test",
    connectStatus: "ready",
  });
  async function event(type, obj, id = "evt_" + type) {
    const raw = JSON.stringify({
      id,
      type,
      livemode: false,
      data: { object: obj },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: signingSecret,
    });
    return billing.webhook(Buffer.from(raw), signature);
  }
  return {
    store,
    billing,
    queue,
    order,
    event,
    transfers,
    get created() {
      return created;
    },
  };
}
test("signed Stripe invoice creates one payment/commission on replay, records marketplace split and freezes on refund", async (t) => {
  const f = setup(t);
  const invoice = {
    id: "in_1",
    subscription: "sub_1",
    currency: "brl",
    paid: true,
    billing_reason: "subscription_create",
    amount_paid: f.order.quote.total,
  };
  await assert.rejects(
    f.billing.webhook(Buffer.from("{}"), "invalid"),
    /Assinatura/,
  );
  await f.event("invoice.paid", invoice, "evt_paid");
  await f.event("invoice.paid", invoice, "evt_paid");
  await f.event("invoice.paid", invoice, "evt_other_duplicate_invoice");
  assert.equal(f.store.all("payments").length, 1);
  assert.equal(f.store.all("commissions").length, 1);
  assert.equal(f.store.all("marketplaceSales").length, 1);
  assert.equal(
    f.store.all("commissions")[0].cents,
    Math.round(f.order.quote.recurring * 0.15),
  );
  const sale = f.store.all("marketplaceSales")[0];
  assert.equal(sale.total, sale.platformCents + sale.sellerCents);
  assert.equal(sale.platformCents, Math.round(sale.total * 0.2));
  assert.equal(f.queue.length, 1);
  assert.equal(f.store.all("invoices")[0].total, f.order.quote.total);
  // Production queue writes a job so renewals don't queue another service.
  f.store.put("jobs", { id: "job", orderId: "order-1" });
  await f.event(
    "invoice.paid",
    {
      ...invoice,
      id: "in_2",
      billing_reason: "subscription_cycle",
      amount_paid: f.order.quote.recurring,
    },
    "evt_renewal",
  );
  assert.equal(f.store.all("commissions").length, 2);
  assert.equal(f.store.all("marketplaceSales").length, 1);
  assert.equal(f.queue.length, 1);
  await f.event("charge.refunded", { id: "ch_1" }, "evt_refund");
  assert.ok(f.store.all("commissions").every((c) => c.status === "review"));
});
test("monthly Connect transfers exclude current month and demo, idempotently recover a crash and avoid duplicate payout", async (t) => {
  const f = setup(t);
  for (const c of [
    {
      id: "old",
      status: "pending",
      createdAt: "2026-08-15T00:00:00Z",
      cents: 1500,
    },
    {
      id: "current",
      status: "pending",
      createdAt: "2026-10-15T00:00:00Z",
      cents: 2000,
    },
    {
      id: "demo",
      status: "demo",
      createdAt: "2026-08-15T00:00:00Z",
      cents: 3000,
    },
  ])
    f.store.put("commissions", { affiliateId: "affiliate-1", ...c });
  let result = await f.billing.payoutPreviousMonth(
    new Date("2026-10-23T12:00:00Z"),
  );
  assert.equal(result.transfers, 1);
  assert.equal(f.created, 1);
  assert.equal(f.transfers[0].amount, 1500);
  assert.equal(f.store.get("commissions", "current").status, "pending");
  result = await f.billing.payoutPreviousMonth(
    new Date("2026-10-23T12:00:00Z"),
  );
  assert.equal(result.transfers, 0);
  assert.equal(f.created, 1);
  const batch = f.store.all("payouts")[0];
  f.store.put("payouts", { ...batch, status: "processing" });
  f.store.put("commissions", {
    ...f.store.get("commissions", "old"),
    status: "pending",
  });
  await f.billing.payoutPreviousMonth(new Date("2026-10-23T12:00:00Z"));
  assert.equal(f.created, 1);
  assert.equal(f.store.get("payouts", batch.id).status, "transferred");
});
test("live billing keys are refused while runtime is simulated", () => {
  assert.throws(
    () => billingProvider({ key: "sk_live_forbidden" }),
    /test mode/,
  );
});
