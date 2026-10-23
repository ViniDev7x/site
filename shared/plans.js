export const PLANS = {
  free: { label: "Free", ram: 4, cpu: 2, disk: 40, slots: 5 },
  starter: { label: "Starter", ram: 6, cpu: 3, disk: 60, slots: 20 },
  plus: { label: "Plus", ram: 10, cpu: 5, disk: 100, slots: 40 },
  pro: { label: "Pro", ram: 16, cpu: 8, disk: 160, slots: 80 },
  elite: { label: "Elite", ram: 32, cpu: 16, disk: 320, slots: 160 },
};
export const FREE_RENEWAL_DAYS = 7;
export function planSpecs(plan, ram = PLANS[plan]?.ram) {
  if (!Object.hasOwn(PLANS, plan)) throw new Error("Plano inválido.");
  if (plan === "elite") {
    if (!Number.isInteger(ram) || ram < 32 || ram > 64)
      throw new Error("Elite: escolha de 32 a 64 GB.");
    return { plan, ram, cpu: Math.ceil(ram / 2), disk: ram * 10 };
  }
  const p = PLANS[plan];
  return { plan, ram: p.ram, cpu: p.cpu, disk: p.disk };
}
export function entitlements(specs) {
  const free = specs.plan === "free";
  return {
    free,
    customDomain: !free,
    automaticBackup: !free,
    manualBackup: true,
    backupRetention: free ? 1 : 7,
    maxSlots:
      specs.category === "Jogos"
        ? (PLANS[specs.plan]?.slots || 20) +
          (free ? 0 : (specs.addons?.slots || 0) * 10)
        : 0,
    renewalDays: free ? FREE_RENEWAL_DAYS : null,
  };
}
