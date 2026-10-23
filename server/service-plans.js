import { createHmac } from "node:crypto";
import { validTaxId } from "./tax-id.js";
import { entitlements, FREE_RENEWAL_DAYS } from "../shared/plans.js";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const stamp = () => new Date().toISOString();
export const freeState = (specs, clock = Date.now) =>
  specs.plan === "free"
    ? {
        renewBy: new Date(clock() + FREE_RENEWAL_DAYS * 86400000).toISOString(),
      }
    : null;
export function servicePlans({
  store,
  config,
  provider,
  notify,
  clock = Date.now,
}) {
  const pepper = config.appKey || "development-free-claims-not-for-production";
  const digest = (type, v) =>
    createHmac("sha256", pepper)
      .update(type + ":" + v)
      .digest("hex");
  const isFree = (s) => s?.quote?.specs.plan === "free";
  const expired = (s) =>
    isFree(s) && Date.parse(s.freeTier?.renewBy || 0) <= clock();
  let running = false;
  function claim(user, input, order) {
    const cpf =
      typeof input.cpf === "string" ? input.cpf.replace(/\D/g, "") : "";
    if (cpf.length !== 11 || !validTaxId(cpf))
      fail(400, "Informe um CPF válido para resgatar o plano Free.");
    if (config.production && (!user.email || !user.emailVerified))
      fail(403, "Confirme seu e-mail para resgatar o Free.");
    let email = String(user.email || input.freeEmail || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      fail(400, "Informe um e-mail válido para o Free.");
    const [local, domain] = email.split("@");
    if (domain === "gmail.com" || domain === "googlemail.com")
      email = local.split("+")[0].replaceAll(".", "") + "@gmail.com";
    const identifiers = [
      ["account", user.id],
      ["cpf", cpf],
      ["email", email],
    ];
    // A verified gateway fingerprint may be recorded by an operator; no card is collected for Free.
    if (user.verifiedCardFingerprint)
      identifiers.push(["card", user.verifiedCardFingerprint]);
    const keys = identifiers.map(([type, value]) => ({
      type,
      id: digest(type, value),
    }));
    if (keys.some((k) => store.get("freeClaims", k.id)))
      fail(
        409,
        "O benefício Free já foi resgatado por esta conta ou identidade. Acesse o serviço existente ou fale com o suporte.",
      );
    for (const k of keys)
      store.put("freeClaims", {
        ...k,
        ownerId: user.id,
        orderId: order.id,
        createdAt: stamp(),
      });
  }
  function finishUpgrade(job, order) {
    const s = store.get("services", job.serviceId);
    if (!s || s.ownerId !== order.ownerId)
      throw new Error("Serviço do upgrade não encontrado.");
    if (s.appliedUpgradeIds?.includes(order.id)) return s;
    if (!isFree(s)) throw new Error("O serviço não está mais no plano Free.");
    return store.put("services", {
      ...s,
      quote: order.quote,
      orderId: order.id,
      cost: order.quote.monthlyEquivalent / 100,
      total: order.quote.specs.ram,
      capacity: order.quote.specs.disk,
      entitlements: entitlements(order.quote.specs),
      freeTier: null,
      pendingUpgradeOrderId: null,
      appliedUpgradeIds: [...(s.appliedUpgradeIds || []), order.id],
      status: s.status === "Hibernado" ? "Offline" : s.status,
      updatedAt: stamp(),
    });
  }
  return {
    isFree,
    expired,
    claim,
    finishUpgrade,
    linkCard(ownerId, fingerprint) {
      if (
        typeof fingerprint !== "string" ||
        !fingerprint ||
        fingerprint.length > 200
      )
        return;
      const user = store.get("users", ownerId);
      if (!user) return;
      const opaque = digest("card", fingerprint),
        id = digest("card", opaque);
      store.transaction(() => {
        store.put("users", { ...user, verifiedCardFingerprint: opaque });
        const ownClaim = store
          .all("freeClaims")
          .find((c) => c.ownerId === ownerId);
        if (ownClaim && !store.get("freeClaims", id))
          store.put("freeClaims", {
            id,
            type: "card",
            ownerId,
            orderId: ownClaim.orderId,
            createdAt: stamp(),
          });
      });
    },
    canStart(s) {
      if (expired(s))
        fail(
          403,
          "O Free precisa de renovação manual. Renove para iniciar; seus dados estão preservados.",
        );
    },
    async renew(s) {
      if (!isFree(s)) fail(400, "Este serviço não é Free.");
      if (s.pendingUpgradeOrderId)
        fail(409, "Aguarde a conclusão do upgrade antes de renovar o Free.");
      if (["Suspenso", "Cancelado"].includes(s.status))
        fail(403, "Serviço indisponível. Fale com o suporte.");
      const next = freeState(s.quote.specs, clock);
      if (config.production) await provider.renewFree(s.id, next.renewBy);
      const latest=store.get('services',s.id);
      if(!isFree(latest))return latest;
      return store.put("services", {
        ...latest,
        freeTier: next,
        status: latest.status === "Hibernado" ? "Offline" : latest.status,
      });
    },
    async lifecycle() {
      if (running) return;
      running = true;
      try {
        for (const s of store
          .all("services")
          .filter(
            (s) =>
              expired(s) &&
              !["Hibernado", "Cancelado", "Suspenso"].includes(s.status),
          )) {
          try {
            if (config.production) await provider.action(s.id, "stop");
            const current = store.get("services", s.id);
            if (!expired(current)) continue;
            store.put("services", { ...current, status: "Hibernado" });
            notify(
              s.ownerId,
              "Renove seu Free",
              `${s.name} foi pausado por falta de renovação. Seus dados foram preservados; renove no painel para voltar a iniciar.`,
            );
          } catch {
            notify(
              s.ownerId,
              "Pausa do Free pendente",
              "A infraestrutura precisa confirmar a pausa. Iniciar permanece bloqueado até a renovação.",
            );
          }
        }
      } finally {
        running = false;
      }
    },
    async upgradeTick(job, order) {
      try {
        if (order?.status !== "paid" || (config.production && !order.live))
          throw new Error("Upgrade sem pagamento confirmado.");
        const u = store.get("users", order.ownerId);
        if (
          order.quote.requiresVerification &&
          (!u?.identityVerified || !u?.paymentVerified)
        )
          throw new Error("Verificação de recursos pendente.");
        const s = store.get("services", job.serviceId);
        if (!s) throw new Error("Serviço não encontrado.");
        if (!job.startedAt) {
          if (config.production)
            await provider.resize(
              s.id,
              order.quote.specs,
              entitlements(order.quote.specs),
              order.id,
            );
          store.put("jobs", {
            ...job,
            status: "running",
            progress: 50,
            message: "Aplicando upgrade sem recriar arquivos ou configurações",
            startedAt: stamp(),
          });
          return;
        }
        if (config.production) {
          const state = await provider.get(s.id);
          if (
            state.status === "failed" ||
            clock() - Date.parse(job.startedAt) > 30 * 60000
          )
            throw new Error("A infraestrutura não concluiu o upgrade.");
          if (
            state.configurationId !== order.id ||
            !["ready", "stopped"].includes(state.status)
          ) {
            store.put("jobs", { ...job, nextAttempt: clock() + 5000 });
            return;
          }
          if(state.address !== s.address)throw new Error('O endereço original não foi preservado.');
          if (
            !["ram", "cpu", "disk"].every(
              (k) => state.resources?.[k] === order.quote.specs[k],
            )
          )
            throw new Error("Recursos do upgrade divergentes.");
        }
        store.transaction(() => {
          this.finishUpgrade(job, order);
          store.put("jobs", {
            ...job,
            status: "completed",
            progress: 100,
            message: "Upgrade concluído. Dados e endereço preservados.",
            completedAt: stamp(),
          });
        });
        notify(
          order.ownerId,
          "Upgrade concluído",
          `${order.name}: plano pago ativado, domínio customizado e backup automático liberados.`,
        );
      } catch {
        // Never DELETE the original service on an upgrade failure. Retry the same idempotent resize.
        const attempts = (job.attempts || 0) + 1;
        store.put("jobs", {
          ...job,
          attempts,
          status: attempts >= 4 ? "failed" : "running",
          nextAttempt: clock() + 15000,
          message:
            attempts >= 4
              ? "Upgrade requer suporte; serviço e dados originais preservados."
              : "Aguardando confirmação do upgrade; dados preservados.",
        });
        if (attempts >= 4)
          notify(
            order.ownerId,
            "Revisão do upgrade necessária",
            "Seus dados foram preservados. O suporte deve reconciliar o pagamento e a configuração antes de nova tentativa.",
          );
      }
    },
  };
}
