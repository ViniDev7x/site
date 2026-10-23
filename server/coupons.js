import { randomUUID } from "node:crypto";
import { PLANS } from "../shared/plans.js";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function couponCode(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Z0-9_-]{3,32}$/.test(value.trim().toUpperCase())
  )
    fail(400, "Cupom inválido. Use 3 a 32 letras, números, _ ou -.");
  return value.trim().toUpperCase();
}
export function couponService({ store, clock = Date.now }) {
  const usages = () => store.all("couponUses");
  function validate(input, previous) {
    const c = {
      ...previous,
      ...input,
      id: previous?.id || randomUUID(),
      code: couponCode(input.code ?? previous?.code),
      updatedAt: new Date(clock()).toISOString(),
    };
    if (
      !["percent", "fixed"].includes(c.type) ||
      !Number.isInteger(c.value) ||
      c.value < 1 ||
      c.value > (c.type === "percent" ? 99 : 10000000)
    )
      fail(400, "Desconto: percentual de 1 a 99 ou valor fixo em centavos.");
    if (
      !Array.isArray(c.plans) ||
      !c.plans.length ||
      c.plans.some((p) => !Object.hasOwn(PLANS, p) || p === "free")
    )
      fail(400, "Selecione planos pagos válidos.");
    if (
      !Number.isInteger(c.maxUses) ||
      c.maxUses < 1 ||
      c.maxUses > 1000000 ||
      typeof c.oncePerAccount !== "boolean" ||
      typeof c.active !== "boolean"
    )
      fail(400, "Revise limites e ativação do cupom.");
    if (
      typeof c.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(c.expiresAt))
    )
      fail(400, "Informe uma validade.");
    if (
      c.startsAt &&
      (!Number.isFinite(Date.parse(c.startsAt)) ||
        Date.parse(c.startsAt) >= Date.parse(c.expiresAt))
    )
      fail(400, "Período inválido.");
    if (
      c.attribution !== undefined &&
      (typeof c.attribution !== "string" || c.attribution.length > 80)
    )
      fail(400, "Referência deve ter até 80 caracteres.");
    if (store.all("coupons").some((x) => x.id !== c.id && x.code === c.code))
      fail(409, "Código já cadastrado.");
    if (
      usages().filter((u) => u.couponId === c.id && u.status !== "released")
        .length > c.maxUses
    )
      fail(409, "Limite abaixo dos usos e reservas existentes.");
    return {
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value,
      plans: [...new Set(c.plans)],
      maxUses: c.maxUses,
      oncePerAccount: c.oncePerAccount,
      active: c.active,
      expiresAt: new Date(c.expiresAt).toISOString(),
      startsAt: c.startsAt ? new Date(c.startsAt).toISOString() : null,
      attribution: c.attribution || "",
      updatedAt: c.updatedAt,
    };
  }
  function apply(q, code, ownerId) {
    if (!code) return q;
    if (q.specs.plan === "free")
      fail(400, "O Free já é gratuito e não aceita cupom.");
    const c = store.all("coupons").find((c) => c.code === couponCode(code));
    if (
      !c ||
      !c.active ||
      Date.parse(c.expiresAt) <= clock() ||
      (c.startsAt && Date.parse(c.startsAt) > clock())
    )
      fail(400, "Cupom inválido, desativado ou fora da validade.");
    if (!c.plans.includes(q.specs.plan))
      fail(400, "Cupom não se aplica a este plano.");
    const used = usages().filter(
      (u) => u.couponId === c.id && u.status !== "released",
    );
    if (used.length >= c.maxUses)
      fail(409, "O cupom atingiu o limite de usos.");
    if (c.oncePerAccount && used.some((u) => u.ownerId === ownerId))
      fail(409, "Cupom já utilizado ou reservado nesta conta.");
    const discount = Math.min(
      Math.max(0, q.recurring - 100),
      c.type === "percent"
        ? Math.round((q.recurring * c.value) / 100)
        : c.value,
    );
    if (!discount) fail(400, "O valor deste plano não permite este desconto.");
    const recurring = q.recurring - discount;
    return {
      ...q,
      beforeCoupon: q.recurring,
      couponDiscount: discount,
      recurring,
      total: recurring + q.once,
      renewal: recurring,
      monthlyEquivalent: Math.round(recurring / q.months),
      coupon: {
        id: c.id,
        code: c.code,
        type: c.type,
        value: c.value,
        attribution: c.attribution,
        duration: "subscription",
      },
    };
  }
  return {
    apply,
    save(input, id) {
      const previous = id ? store.get("coupons", id) : null;
      if (id && !previous) fail(404, "Cupom não encontrado.");
      return store.put("coupons", validate(input, previous));
    },
    reserve(order) {
      if (!order.quote.coupon) return;
      store.put("couponUses", {
        id: order.id,
        couponId: order.quote.coupon.id,
        code: order.quote.coupon.code,
        ownerId: order.ownerId,
        orderId: order.id,
        status: "reserved",
        discount: order.quote.couponDiscount,
        attribution: order.quote.coupon.attribution,
        createdAt: new Date(clock()).toISOString(),
      });
    },
    redeem(order) {
      const u = store.get("couponUses", order.id);
      if (u && u.status !== "redeemed")
        store.put("couponUses", {
          ...u,
          status: "redeemed",
          redeemedAt: new Date(clock()).toISOString(),
        });
    },
    release(orderId) {
      const u = store.get("couponUses", orderId);
      if (u?.status === "reserved")
        store.put("couponUses", {
          ...u,
          status: "released",
          releasedAt: new Date(clock()).toISOString(),
        });
    },
    report() {
      return {
        coupons: store
          .all("coupons")
          .map((c) => ({
            ...c,
            redeemed: usages().filter(
              (u) => u.couponId === c.id && u.status === "redeemed",
            ).length,
            reserved: usages().filter(
              (u) => u.couponId === c.id && u.status === "reserved",
            ).length,
          })),
        uses: usages(),
      };
    },
  };
}
