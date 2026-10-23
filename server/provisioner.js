import { TABLE } from "../shared/pricing.js";
const TYPES = {
  Jogos: ["Minecraft", "FiveM", "Rust", "ARK"],
  "Bots Discord": ["Node.js", "Python"],
  Sites: ["Next.js", "Estático", "PHP", "Python / Django"],
};
// Adapter contract in docs/PROVISIONER.md. Never executes customer code in the API process.
export function provisionerClient({ url, token, request = fetch }) {
  const configured = Boolean(url && token);
  async function call(path, method = "GET", data, key) {
    if (!configured) throw new Error("Provisionador não configurado.");
    const response = await request(url + path, {
      method,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = new Error("O provisionador não completou a operação.");
      error.retryable = response.status >= 500 || response.status === 429;
      throw error;
    }
    if (response.status === 204) return { deleted: true };
    return response.json();
  }
  return {
    configured,
    async probe() {
      try {
        const h = await call("/v1/health");
        if (
          h.ready !== true ||
          h.mode !== "production" ||
          h.isolationEnforced !== true ||
          !Array.isArray(h.categories) ||
          !h.limits
        )
          return null;
        const categories = h.categories.filter(
          (c) =>
            Object.hasOwn(TYPES, c) &&
            Array.isArray(h.types?.[c]) &&
            h.types[c].some((t) => TYPES[c].includes(t)),
        );
        const regions = (h.regions || []).filter((r) =>
          Object.hasOwn(TABLE.regions, r),
        );
        if (
          !categories.length ||
          !regions.length ||
          !["ram", "cpu", "disk"].every(
            (k) =>
              Number.isInteger(h.limits[k]) &&
              h.limits[k] >= (k === "disk" ? 10 : 1),
          )
        )
          return null;
        return {
          ready: true,
          mode: "production",
          isolationEnforced: true,
          categories,
          types: Object.fromEntries(
            categories.map((c) => [
              c,
              h.types[c].filter((t) => TYPES[c].includes(t)),
            ]),
          ),
          regions,
          limits: {
            ram: Math.min(8, h.limits.ram),
            cpu: Math.min(4, h.limits.cpu),
            disk: Math.min(100, h.limits.disk),
          },
        };
      } catch {
        return null;
      }
    },
    async create(job, order) {
      const result = await call(
        "/v1/services",
        "POST",
        {
          id: job.serviceId,
          name: order.name,
          ownerId: order.ownerId,
          category: order.quote.specs.category,
          subtype: order.subtype,
          resources: order.quote.specs,
        },
        job.serviceId,
      );
      if (result.id !== job.serviceId)
        throw new Error("Identificador divergente do provisionador.");
      return result;
    },
    async get(id) {
      const result = await call(`/v1/services/${encodeURIComponent(id)}`);
      if (result.id !== id)
        throw new Error("Identificador divergente do provisionador.");
      return result;
    },
    async remove(id) {
      return call(`/v1/services/${encodeURIComponent(id)}`, "DELETE");
    },
    async action(id, action) {
      return call(
        `/v1/services/${encodeURIComponent(id)}/actions`,
        "POST",
        { action },
        `${id}:${action}:${crypto.randomUUID()}`,
      );
    },
  };
}
export function validAddress(value) {
  return (
    typeof value === "string" &&
    value.length <= 253 &&
    /^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(value) &&
    !value.endsWith(".invalid")
  );
}
