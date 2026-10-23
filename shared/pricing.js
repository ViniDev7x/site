// All prices are integer BRL cents. Both UI and API use the same versioned table.
export const TABLE = {
  version: "2026-10-v1",
  resources: { ram: 600, cpu: 800, disk: 20 },
  regions: { "São Paulo, BR": 1.15, "Miami, EUA": 1, "Frankfurt, DE": 1.1 },
  types: { Jogos: 1.2, "Bots Discord": 0.85, Sites: 1 },
  cycles: {
    monthly: { label: "Mensal", months: 1, discount: 0 },
    semiannual: { label: "Semestral", months: 6, discount: 0.1 },
    annual: { label: "Anual", months: 12, discount: 0.2 },
  },
  addons: {
    backup: {
      label: "Backup estendido · retenção 30 dias",
      cents: 990,
      categories: ["Jogos", "Bots Discord", "Sites"],
    },
    ip: {
      label: "IP dedicado",
      cents: 1490,
      categories: ["Jogos", "Bots Discord", "Sites"],
    },
    slots: { label: "10 slots extras", cents: 500, categories: ["Jogos"] },
    domain: {
      label: "Domínio adicional · configuração, sem registro",
      cents: 790,
      categories: ["Sites"],
    },
    priority: {
      label: "Suporte prioritário",
      cents: 1990,
      categories: ["Jogos", "Bots Discord", "Sites"],
    },
  },
  agency: {
    personal: { label: "Personal", cents: 0 },
    agency: { label: "Agência · gestão multicliente", cents: 4990 },
    reseller: { label: "Revenda · white label", cents: 9990 },
  },
  margin: { min: 0, max: 40 },
  affiliateRate: 0.15,
  marketplaceFee: 0.2,
};
export const CATALOG = [
  {
    id: "survival",
    subtype: "Minecraft",
    title: "Survival Essentials",
    category: "Jogos",
    description:
      "Configuração inicial de survival com guia de plugins e permissões.",
    cents: 1990,
    seller: "Nexora Studio",
    icon: "⛏",
  },
  {
    id: "moderation",
    subtype: "Node.js",
    title: "Guard · Bot de moderação",
    category: "Bots Discord",
    description: "Template Node.js com estrutura para moderação e comandos.",
    cents: 2490,
    seller: "Community Labs",
    icon: "🤖",
  },
  {
    id: "portfolio",
    subtype: "Estático",
    title: "Portfolio Starter",
    category: "Sites",
    description:
      "Template de site estático responsivo para seu próximo projeto.",
    cents: 1490,
    seller: "Web Collective",
    icon: "◈",
  },
];
export const brl = (cents) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const has = (obj, key) => Object.hasOwn(obj, key);
const int = (v, min, max, field) => {
  if (!Number.isInteger(v) || v < min || v > max)
    throw new Error(`${field}: informe um inteiro entre ${min} e ${max}.`);
  return v;
};
export function normalizeSpecs(input = {}) {
  const {
    category = "Jogos",
    region = "São Paulo, BR",
    cycle = "monthly",
    agency = "personal",
  } = input;
  if (
    !has(TABLE.types, category) ||
    !has(TABLE.regions, region) ||
    !has(TABLE.cycles, cycle) ||
    !has(TABLE.agency, agency)
  )
    throw new Error("Categoria, região, ciclo ou plano inválido.");
  const addons = {};
  for (const [key, quantity] of Object.entries(input.addons || {})) {
    if (
      !has(TABLE.addons, key) ||
      !TABLE.addons[key].categories.includes(category)
    )
      throw new Error("Add-on incompatível com a categoria.");
    addons[key] = int(
      quantity,
      0,
      key === "slots" || key === "domain" ? 10 : 1,
      "Quantidade do add-on",
    );
  }
  const template = input.template || null;
  if (
    template &&
    !CATALOG.some((p) => p.id === template && p.category === category)
  )
    throw new Error("Template incompatível.");
  return {
    category,
    region,
    cycle,
    agency,
    addons,
    template,
    ram: int(input.ram ?? 4, 1, 64, "RAM"),
    cpu: int(input.cpu ?? 2, 1, 32, "CPU"),
    disk: int(input.disk ?? 40, 10, 1000, "Disco"),
  };
}
export function quote(input, margin = 0) {
  const specs = normalizeSpecs(input);
  if (
    !Number.isFinite(margin) ||
    margin < TABLE.margin.min ||
    margin > TABLE.margin.max
  )
    throw new Error("Margem fora da faixa permitida.");
  const factor = TABLE.types[specs.category] * TABLE.regions[specs.region];
  const resourceLines = [
    ["ram", "Memória RAM", "GB"],
    ["cpu", "CPU", "vCPU"],
    ["disk", "Disco NVMe", "GB"],
  ].map(([key, label, unit]) => ({
    key,
    label: `${label} · ${specs[key]} ${unit}`,
    cents: Math.round(specs[key] * TABLE.resources[key] * factor),
  }));
  const addonLines = Object.entries(specs.addons)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => ({
      key,
      label: `${TABLE.addons[key].label} × ${qty}`,
      cents: TABLE.addons[key].cents * qty,
    }));
  const infrastructure =
    resourceLines.reduce((n, l) => n + l.cents, 0) +
    addonLines.reduce((n, l) => n + l.cents, 0);
  const marginCents = Math.round((infrastructure * margin) / 100);
  const planCents = TABLE.agency[specs.agency].cents;
  const monthly = infrastructure + marginCents + planCents;
  const cycle = TABLE.cycles[specs.cycle];
  const subtotal = monthly * cycle.months;
  const discount = Math.round(subtotal * cycle.discount);
  const recurring = subtotal - discount;
  const product = CATALOG.find((p) => p.id === specs.template);
  const once = product?.cents || 0;
  return {
    version: TABLE.version,
    specs,
    resourceLines,
    addonLines,
    regionFactor: TABLE.regions[specs.region],
    typeFactor: TABLE.types[specs.category],
    margin,
    marginCents,
    planCents,
    monthly,
    months: cycle.months,
    discountPercent: cycle.discount * 100,
    discount,
    recurring,
    monthlyEquivalent: Math.round(recurring / cycle.months),
    once,
    total: recurring + once,
    renewal: recurring,
    requiresVerification: specs.ram > 8 || specs.cpu > 4 || specs.disk > 100,
    taxesIncluded: true,
    currency: "brl",
  };
}
