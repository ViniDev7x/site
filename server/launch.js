import { randomUUID } from "node:crypto";
import { quote } from "../shared/pricing.js";
import { validAddress } from "./provisioner.js";
export function launchOperations({
  store,
  config,
  mail,
  backups,
  provider,
  billing,
  notify,
  fetchPublic = fetch,
  instanceId,
  plans,
}) {
  let probing = false;
  let stopping = false;
  const activeJobs = new Set();
  const health = {
    tls: false,
    stripe: false,
    mail: false,
    provider: null,
    checkedAt: 0,
  };
  function proof() {
    const user = store
      .all("users")
      .find((u) => u.email === config.launchTestEmail && u.emailVerified);
    if (!user) return false;
    const welcome =
      store.get("mailOutbox", `welcome:${user.id}`)?.status === "delivered";
    return (
      welcome &&
      store.all("jobs").some((j) => {
        const order = store.get("orders", j.orderId);
        if (j.ownerId !== user.id || j.status !== "completed" || !order?.live)
          return false;
        const invoice = store
          .all("invoices")
          .find(
            (i) =>
              i.orderId === order.id && i.live === true && i.status === "paid",
          );
        return (
          invoice &&
          store.get("services", j.serviceId)?.demo === false &&
          store.get("mailOutbox", `ready:${j.serviceId}`)?.status ===
            "delivered" &&
          store.get("mailOutbox", `receipt:${invoice.id}`)?.status ===
            "delivered"
        );
      })
    );
  }
  function prerequisites() {
    return (
      health.tls &&
      health.stripe &&
      health.mail &&
      health.provider &&
      backups.healthy() &&
      Date.now() - health.checkedAt < 180000
    );
  }
  return {
    stop() {
      stopping = true;
    },
    status() {
      return {
        ...health,
        backup: backups.healthy(),
        proof: proof(),
        publicCheckout: config.publicCheckout,
        ready: Boolean(prerequisites() && (!config.publicCheckout || proof())),
      };
    },
    canStartFree(ownerId) {
      const u = store.get("users", ownerId);
      return Boolean(
        u?.emailVerified &&
          health.tls &&
          health.mail &&
          health.provider?.freeTier &&
          config.serviceDomain &&
          backups.healthy() &&
          Date.now() - health.checkedAt < 180000,
      );
    },
    canCharge(ownerId) {
      const user = store.get("users", ownerId);
      return Boolean(
        prerequisites() &&
          user?.emailVerified &&
          (config.publicCheckout
            ? proof()
            : config.launchTestEmail && user.email === config.launchTestEmail),
      );
    },
    supports(specs, subtype) {
      const p = health.provider;
      return Boolean(
        p &&
          p.categories.includes(specs.category) &&
          p.types[specs.category]?.includes(subtype) &&
          p.regions.includes(specs.region) &&
          ["ram", "cpu", "disk"].every((k) => specs[k] <= p.limits[k]),
      );
    },
    async probe() {
      if (probing) return;
      probing = true;
      try {
        const [tls, stripe, mailReady, providerHealth] = await Promise.all([
          (async () => {
            try {
              const r = await fetchPublic(config.origin + "/api/health", {
                redirect: "error",
                signal: AbortSignal.timeout(10000),
              });
              return r.ok && (await r.json()).instanceId === instanceId;
            } catch {
              return false;
            }
          })(),
          (async () => {
            try {
              const a = await billing.stripe?.accounts.retrieve();
              return (
                a?.charges_enabled === true &&
                a?.details_submitted === true &&
                a?.payouts_enabled === true
              );
            } catch {
              return false;
            }
          })(),
          mail.probe(),
          provider.probe(),
        ]);
        Object.assign(health, {
          tls,
          stripe,
          mail: mailReady,
          provider: providerHealth,
          checkedAt: Date.now(),
        });
      } finally {
        probing = false;
      }
    },
    async tick() {
      for (const job of store
        .all("jobs")
        .filter(
          (j) =>
            ["queued", "running"].includes(j.status) &&
            (!j.nextAttempt || j.nextAttempt < Date.now()),
        )) {
        if (stopping) break;
        if (activeJobs.has(job.id)) continue;
        activeJobs.add(job.id);
        try {
          const order = store.get("orders", job.orderId);
          if (job.kind === "upgrade") {
            await plans.upgradeTick(job, order);
            continue;
          }
          if (
            (!order?.live && order?.paymentMode !== "free") ||
            order.status !== "paid"
          )
            throw Object.assign(
              new Error("Pedido sem pagamento live confirmado."),
              { retryable: false },
            );
          if (!job.startedAt) {
            await provider.create(job, order);
            store.put("jobs", {
              ...job,
              status: "running",
              startedAt: new Date().toISOString(),
              progress: 30,
              message: "Provisionamento solicitado à infraestrutura",
            });
            continue;
          }
          if (Date.now() - Date.parse(job.startedAt) > 30 * 60000)
            throw Object.assign(
              new Error("Tempo máximo de provisionamento excedido."),
              { retryable: false },
            );
          const result = await provider.get(job.serviceId);
          if (result.status === "failed")
            throw Object.assign(new Error("Infraestrutura reportou falha."), {
              retryable: false,
            });
          if (result.status !== "ready") {
            store.put("jobs", {
              ...job,
              status: "running",
              progress: 60,
              message: "Aguardando instalação e validação do serviço",
              nextAttempt: Date.now() + 5000,
            });
            continue;
          }
          if (!validAddress(result.address))
            throw Object.assign(new Error("Endereço de acesso inválido."), {
              retryable: false,
            });
          if (
            order.paymentMode === "free" &&
            result.address !== order.platformHostname
          )
            throw Object.assign(
              new Error("O Free exige o subdomínio atribuído pela plataforma."),
              { retryable: false },
            );
          store.transaction(() => {
            const s = order.quote.specs;
            const service = store.put("services", {
              id: job.serviceId,
              ownerId: order.ownerId,
              orderId: order.id,
              name: order.name,
              type: order.subtype,
              category: s.category,
              icon:
                s.category === "Jogos"
                  ? "⛏"
                  : s.category === "Sites"
                    ? "globe"
                    : "bot",
              style:
                s.category === "Jogos"
                  ? "minecraft"
                  : s.category === "Sites"
                    ? "website"
                    : "discord",
              status: "Online",
              cpu: 0,
              ram: 0,
              disk: 0,
              metricsAvailable: false,
              total: s.ram,
              capacity: s.disk,
              address: result.address,
              cost: order.quote.monthlyEquivalent / 100,
              quote: order.quote,
              entitlements: order.entitlements,
              freeTier:
                order.paymentMode === "free"
                  ? { renewBy: order.freeRenewBy }
                  : null,
              demo: false,
              createdAt: new Date().toISOString(),
              onboarding: { tourSeen: true, steps: {} },
            });
            store.put("jobs", {
              ...job,
              status: "completed",
              progress: 100,
              message: "Serviço pronto e validado pela infraestrutura",
              completedAt: new Date().toISOString(),
            });
            const user = store.get("users", order.ownerId);
            notify(
              user.id,
              "Seu serviço está pronto",
              `${service.name} · ${service.type} · ${service.address}`,
            );
            mail.enqueue({
              id: `ready:${service.id}`,
              ownerId: user.id,
              kind: "ready",
              to: user.email,
              subject: "Seu serviço está pronto",
              message: `${service.name} está pronto.\nTecnologia: ${service.type}\nEndereço: ${service.address}\nSuporte: ${config.supportEmail}`,
              link: `${config.origin}/?service=${service.id}`,
            });
          });
        } catch (error) {
          const attempts = (job.attempts || 0) + 1;
          if (error.retryable !== false && attempts < 4) {
            store.put("jobs", {
              ...job,
              attempts,
              nextAttempt: Date.now() + Math.min(60000, 5000 * 2 ** attempts),
              message:
                "Infraestrutura temporariamente indisponível; nova tentativa agendada",
            });
            continue;
          }
          let rolledBack = false;
          try {
            const r = await provider.remove(job.serviceId);
            rolledBack = r.deleted === true;
          } catch {}
          store.put("jobs", {
            ...job,
            status: "failed",
            attempts,
            rolledBack,
            message: rolledBack
              ? "Provisionamento falhou. Recursos revertidos; suporte notificado."
              : "Provisionamento requer revisão da infraestrutura. Suporte notificado.",
          });
          notify(
            job.ownerId,
            "Falha na criação do serviço",
            `Não foi possível entregar seu serviço. Contate ${config.supportEmail}. Nenhum serviço foi marcado como pronto.`,
          );
          const user = store.get("users", job.ownerId);
          mail.enqueue({
            id: `provision-failure:${job.id}`,
            ownerId: job.ownerId,
            kind: "failure",
            to: user?.email,
            subject: "Precisamos revisar a criação do seu serviço",
            message: `A infraestrutura não concluiu a entrega do seu pedido. Entre em contato com ${config.supportEmail}. A equipe foi notificada e deve providenciar correção ou reembolso.`,
            link: config.origin,
          });
          mail.enqueue({
            id: `ops-provision:${job.id}`,
            ownerId: "operator",
            kind: "alert",
            to: config.supportEmail,
            subject: "Ação urgente: falha no provisionamento",
            message: `Pedido ${job.orderId}; job ${job.id}; rollback confirmado: ${rolledBack}. Confira o gateway e cancele/reembolse se não houver entrega.`,
          });
        } finally {
          activeJobs.delete(job.id);
        }
      }
    },
  };
}
