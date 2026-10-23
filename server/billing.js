import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { TABLE } from "../shared/pricing.js";
export function billingProvider({
  store,
  key,
  webhookSecret,
  origin,
  notify,
  queue,
  stripeClient,
  production = false,
  mail,
  supportEmail = "",
  canCharge,
  onSubscriptionDeleted,
}) {
  if (
    key &&
    !(production ? key.startsWith("sk_live_") : key.startsWith("sk_test_"))
  )
    throw new Error(
      production
        ? "Produção exige uma chave Stripe live."
        : "Somente Stripe test mode é permitido enquanto o provisionador for simulado.",
    );
  const stripe =
    stripeClient ||
    (key ? new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 }) : null);
  const configured = Boolean(
    stripe && webhookSecret && origin?.startsWith("https://"),
  );
  let running = false;
  function recordPayment(
    order,
    eventId,
    invoiceId,
    recurringCents,
    demo = false,
  ) {
    return store.transaction(() => {
      const paymentId = `${demo ? "demo" : "stripe"}:${invoiceId}`;
      if (store.get("payments", paymentId)) return order;
      store.put("payments", {
        id: paymentId,
        orderId: order.id,
        eventId,
        createdAt: new Date().toISOString(),
        recurringCents,
        demo,
      });
      const invoice = store.put("invoices", {
        id: paymentId,
        ownerId: order.ownerId,
        orderId: order.id,
        total:
          recurringCents + (order.status === "paid" ? 0 : order.quote.once),
        recurring: recurringCents,
        status: "paid",
        demo,
        live: production && !demo,
        date: new Date().toISOString(),
      });
      if (order.referrerId && order.referrerId !== order.ownerId) {
        const affiliate = store.get("affiliates", order.referrerId);
        if (affiliate) {
          const ratio = order.quote.recurring
            ? recurringCents / order.quote.recurring
            : 0;
          const earned =
            order.quote.margin > 0
              ? Math.round(
                  order.quote.marginCents *
                    order.quote.months *
                    (1 - order.quote.discountPercent / 100) *
                    ratio,
                )
              : Math.round(recurringCents * TABLE.affiliateRate);
          store.put("commissions", {
            id: paymentId,
            affiliateId: order.referrerId,
            customerId: order.ownerId,
            orderId: order.id,
            invoiceId: invoice.id,
            cents: earned,
            status: demo ? "demo" : "pending",
            createdAt: new Date().toISOString(),
            mode: order.quote.margin > 0 ? "margin" : "referral",
          });
        }
      }
      if (order.quote.once && !order.marketplaceRecorded) {
        store.put("marketplaceSales", {
          id: order.id,
          ownerId: order.ownerId,
          template: order.quote.specs.template,
          total: order.quote.once,
          platformCents: Math.round(order.quote.once * TABLE.marketplaceFee),
          sellerCents:
            order.quote.once -
            Math.round(order.quote.once * TABLE.marketplaceFee),
          demo,
          payoutStatus: "pending-seller-integration",
          date: new Date().toISOString(),
        });
      }
      const updated = store.put("orders", {
        ...order,
        status: "paid",
        live: production && !demo,
        marketplaceRecorded: true,
      });
      if (production && !demo) {
        const user = store.get("users", order.ownerId);
        if (!user?.email) throw new Error("Cliente sem e-mail de recibo.");
        mail.enqueue({
          id: `receipt:${invoice.id}`,
          ownerId: user.id,
          kind: "receipt",
          to: user.email,
          subject: "Pagamento confirmado · Nexora",
          message: `Recebemos o pagamento de ${(invoice.total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para ${order.name}.\nCiclo: ${order.quote.months} mês(es).\nAcompanhe o provisionamento no painel.\nSuporte: ${supportEmail}.`,
          link: origin + "/?checkout=success",
        });
      }
      const existing = store.all("jobs").find((j) => j.orderId === order.id);
      if (!existing) queue(updated);
      notify(
        order.ownerId,
        "Pagamento registrado",
        `${production ? "Pagamento confirmado" : demo ? "Simulação" : "Stripe test mode"}: ${order.name}. ${order.targetServiceId ? "Adicionais registrados no serviço." : "Provisionamento de demonstração na fila."}`,
      );
      return updated;
    });
  }
  return {
    configured,
    stripe,
    recordDemo(order) {
      if (production)
        throw new Error("Demonstrações não são permitidas em produção.");
      return recordPayment(
        order,
        "demo",
        order.id,
        order.quote.recurring,
        true,
      );
    },
    async checkout(order) {
      if (production && !canCharge?.(order.ownerId))
        throw Object.assign(
          new Error(
            "Checkout bloqueado: pré-requisitos de lançamento ainda não verificados.",
          ),
          { status: 503 },
        );
      if (!configured)
        throw Object.assign(
          new Error(
            "Stripe test mode não configurado. Use a criação de demonstração, sem cobrança.",
          ),
          { status: 503 },
        );
      const q = order.quote;
      const lines = [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `${order.name} · ${q.specs.category} (${q.months} meses)`,
            },
            recurring: { interval: "month", interval_count: q.months },
            unit_amount: q.recurring,
          },
          quantity: 1,
        },
      ];
      if (q.once)
        lines.push({
          price_data: {
            currency: "brl",
            product_data: { name: "Licença de template · pagamento único" },
            unit_amount: q.once,
          },
          quantity: 1,
        });
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          client_reference_id: order.id,
          ...(production ? { customer_email: order.customerEmail } : {}),
          metadata: { orderId: order.id },
          subscription_data: { metadata: { orderId: order.id } },
          line_items: lines,
          success_url: `${origin}/?checkout=success`,
          cancel_url: `${origin}/?checkout=cancelled`,
        },
        { idempotencyKey: `checkout:${order.id}` },
      );
      store.put("orders", { ...order, checkoutId: session.id });
      return { url: session.url };
    },
    async cancelRenewal(order) {
      if (!production || !order.stripeSubscription)
        throw Object.assign(new Error("Assinatura ativa não encontrada."), {
          status: 400,
        });
      await stripe.subscriptions.update(
        order.stripeSubscription,
        { cancel_at_period_end: true },
        { idempotencyKey: `cancel-renewal:${order.id}` },
      );
      store.put("orders", { ...order, cancelAtPeriodEnd: true });
      const user = store.get("users", order.ownerId);
      mail.enqueue({
        id: `cancellation:${order.id}`,
        ownerId: user.id,
        kind: "cancellation",
        to: user.email,
        subject: "Renovação automática cancelada",
        message: `A renovação de ${order.name} foi cancelada. O serviço permanece disponível até o fim do período pago. Para solicitar reembolso conforme a política, contate ${supportEmail}.`,
        link: origin + "/reembolsos",
      });
      return {
        cancelAtPeriodEnd: true,
        message: "Renovação cancelada para o fim do período pago.",
      };
    },
    async connect(affiliate) {
      if (!configured)
        throw Object.assign(
          new Error(
            "Configure Stripe test mode, webhook e APP_ORIGIN HTTPS antes de conectar.",
          ),
          { status: 503 },
        );
      let account = affiliate.stripeAccountId;
      if (!account) {
        const created = await stripe.accounts.create(
          {
            type: "express",
            country: "BR",
            capabilities: { transfers: { requested: true } },
            metadata: { affiliateId: affiliate.id },
          },
          { idempotencyKey: `connect:${affiliate.id}` },
        );
        account = created.id;
        store.put("affiliates", {
          ...affiliate,
          stripeAccountId: account,
          connectStatus: "pending",
        });
      }
      const link = await stripe.accountLinks.create({
        account,
        refresh_url: `${origin}/?connect=refresh`,
        return_url: `${origin}/?connect=return`,
        type: "account_onboarding",
      });
      return { url: link.url };
    },
    async webhook(raw, signature) {
      if (!configured)
        throw Object.assign(new Error("Webhook não configurado."), {
          status: 503,
        });
      let event;
      try {
        event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
      } catch {
        throw Object.assign(new Error("Assinatura Stripe inválida."), {
          status: 400,
        });
      }
      if (Boolean(event.livemode) !== production)
        throw Object.assign(
          new Error("Modo do evento Stripe incompatível com o ambiente."),
          {
            status: 400,
          },
        );
      if (store.get("events", event.id))
        return { received: true, duplicate: true };
      const obj = event.data.object;
      if (event.type === "account.updated") {
        const a = store
          .all("affiliates")
          .find((a) => a.stripeAccountId === obj.id);
        if (a)
          store.put("affiliates", {
            ...a,
            connectStatus:
              obj.payouts_enabled && obj.capabilities?.transfers === "active"
                ? "ready"
                : "pending",
          });
      }
      if (event.type === "invoice.paid") {
        const subRef =
          obj.parent?.subscription_details?.subscription || obj.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const order = store.get("orders", sub.metadata.orderId);
          if (order) {
            // The checkout is fixed-price, with no promotional codes. Only paid BRL invoices accrue commission.
            if (obj.currency !== "brl" || !obj.paid)
              throw new Error("Fatura inválida.");
            const isFirst = obj.billing_reason === "subscription_create";
            const recurring = Math.max(
              0,
              obj.amount_paid - (isFirst ? order.quote.once : 0),
            );
            if (recurring !== order.quote.recurring)
              throw new Error(
                "Total da fatura difere do pedido; revisão necessária.",
              );
            if (production) {
              store.put("orders", {
                ...order,
                stripeSubscription: subId,
                stripeCustomer:
                  typeof sub.customer === "string"
                    ? sub.customer
                    : sub.customer?.id,
              });
            }
            recordPayment(
              store.get("orders", order.id) || order,
              event.id,
              obj.id,
              recurring,
            );
          }
        }
      }
      if (production && event.type === "invoice.payment_failed") {
        const sub =
          obj.parent?.subscription_details?.subscription || obj.subscription;
        const id = typeof sub === "string" ? sub : sub?.id;
        const order = store
          .all("orders")
          .find((o) => o.stripeSubscription === id);
        if (order) {
          const user = store.get("users", order.ownerId);
          notify(
            user.id,
            "Pagamento pendente",
            "Revise seu pagamento ou fale com o suporte.",
          );
          mail.enqueue({
            id: `payment-failed:${obj.id}`,
            ownerId: user.id,
            kind: "billing",
            to: user.email,
            subject: "Pagamento pendente na Nexora",
            message: `Não foi possível confirmar uma cobrança de ${order.name}. Entre em contato com ${supportEmail}.`,
            link: origin,
          });
        }
      }
      if (production && event.type === "customer.subscription.deleted") {
        const order = store
          .all("orders")
          .find((o) => o.stripeSubscription === obj.id);
        if (order) {
          await onSubscriptionDeleted?.(order);
          store.put("orders", { ...order, subscriptionStatus: "cancelled" });
        }
      }
      // Credits/refunds conservatively freeze pending commissions for manual reconciliation.
      if (
        [
          "charge.refunded",
          "charge.dispute.created",
          "credit_note.created",
        ].includes(event.type)
      ) {
        for (const commission of store
          .all("commissions")
          .filter((c) => c.status === "pending"))
          store.put("commissions", {
            ...commission,
            status: "review",
            reason: `Reconciliação ${event.type}`,
            eventId: event.id,
          });
        notify(
          "admin",
          "Conciliação financeira necessária",
          `${event.type}: repasses pendentes bloqueados para revisão. Repasses já enviados exigem reconciliação manual.`,
        );
      }
      store.put("events", {
        id: event.id,
        type: event.type,
        createdAt: new Date().toISOString(),
      });
      return { received: true };
    },
    async payoutPreviousMonth(now = new Date()) {
      if (!configured) return { status: "unconfigured", transfers: 0 };
      if (running) return { status: "running", transfers: 0 };
      running = true;
      let transfers = 0;
      try {
        const cutoff = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        ).toISOString();
        const period = cutoff.slice(0, 7);
        for (const affiliate of store
          .all("affiliates")
          .filter((a) => a.connectStatus === "ready")) {
          let batch = store
            .all("payouts")
            .find(
              (p) =>
                p.affiliateId === affiliate.id &&
                ["processing", "failed"].includes(p.status),
            );
          if (!batch) {
            const items = store
              .all("commissions")
              .filter(
                (c) =>
                  c.affiliateId === affiliate.id &&
                  c.status === "pending" &&
                  c.createdAt < cutoff,
              );
            if (!items.length) continue;
            batch = store.put("payouts", {
              id: randomUUID(),
              affiliateId: affiliate.id,
              period,
              commissionIds: items.map((c) => c.id),
              cents: items.reduce((n, c) => n + c.cents, 0),
              status: "processing",
            });
          }
          if (
            batch.commissionIds.some(
              (id) => store.get("commissions", id)?.status !== "pending",
            )
          )
            continue;
          const group = `nexora_${batch.id}`;
          try {
            // Recover a transfer after a crash, even beyond Stripe's idempotency-key retention window.
            let transfer;
            for await (const t of stripe.transfers.list({
              transfer_group: group,
              limit: 100,
            })) {
              transfer = t;
              break;
            }
            if (!transfer)
              transfer = await stripe.transfers.create(
                {
                  amount: batch.cents,
                  currency: "brl",
                  destination: affiliate.stripeAccountId,
                  transfer_group: group,
                  metadata: { payoutId: batch.id },
                },
                { idempotencyKey: group },
              );
            store.transaction(() => {
              store.put("payouts", {
                ...batch,
                status: "transferred",
                transferId: transfer.id,
              });
              for (const id of batch.commissionIds)
                store.put("commissions", {
                  ...store.get("commissions", id),
                  status: "transferred",
                  payoutId: batch.id,
                });
            });
            transfers++;
          } catch {
            store.put("payouts", {
              ...batch,
              status: "failed",
              error:
                "Falha no Stripe; confira saldo, conta Connect e permissões.",
            });
          }
        }
        return { status: "complete", transfers };
      } finally {
        running = false;
      }
    },
  };
}
