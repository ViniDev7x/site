import http from "node:http";
import proxyaddr from "proxy-addr";
import {
  loadRuntime,
  configIssues,
  publicRuntime,
  LEGAL_VERSION,
} from "./runtime.js";
import { mailService } from "./mail.js";
import { authService, publicUser } from "./auth.js";
import { backupService } from "./backup.js";
import { provisionerClient } from "./provisioner.js";
import { launchOperations } from "./launch.js";
import { serveWeb, securityHeaders } from "./web.js";
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createStore } from "./store.js";
import { Limiter, POLICY, isolationProfile, scanUpload } from "./security.js";
import { TABLE, CATALOG, quote } from "../shared/pricing.js";
import { billingProvider } from "./billing.js";
import { templateArchive } from "./templates.js";
const now = () => new Date().toISOString();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
function safeEqual(a, b) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export function createApplication(options = {}) {
  const config = loadRuntime(process.env, {
    ...options.runtime,
    ...(options.production === undefined
      ? {}
      : { production: options.production }),
  });
  const production = config.production;
  const issues = configIssues(config);
  if (issues.length)
    throw new Error(
      "Configuração de produção incompleta: " + issues.join(", "),
    );
  const dataDir =
    options.dataDir || config.dataDir || join(process.cwd(), ".local");
  config.dataDir = dataDir;
  const instanceId = randomUUID();
  const trusted = config.trustedProxies.length
    ? proxyaddr.compile(config.trustedProxies)
    : () => false;
  const clientIp = (req) => proxyaddr(req, trusted);
  let launch;let closing=false;const pending=new Set();
  function track(promise){pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;}
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const store = options.store || createStore(join(dataDir, "nexora.sqlite"));
  const mode = store.get("system", "mode");
  if (mode?.production !== undefined && mode.production !== production)
    throw new Error("Use bancos separados para produção e demonstração.");
  if (production && store.all("users").some((u) => !u.email || !u.passwordHash))
    throw new Error("Não use dados de demonstração em produção.");
  store.put("system", { id: "mode", production });
  let adminToken = options.adminToken || config.adminToken;
  if (!adminToken) {
    const path = join(dataDir, "admin-token");
    if (!existsSync(path))
      writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600 });
    adminToken = readFileSync(path, "utf8").trim();
  }
  const limiter = new Limiter();
  const mail = mailService({ store, config, client: options.mailClient });
  const auth = authService({ store, config, limiter, mail });
  const backups = backupService({ store, config, s3: options.s3 });
  const provider = provisionerClient({
    url: config.provisionerUrl,
    token: config.provisionerToken,
    request: options.provisionerFetch,
  });
  if (production)
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS access_logs (created_at TEXT NOT NULL, ip TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS access_log_date ON access_logs(created_at);",
    );
  const notify = (ownerId, title, message) =>
    store.put("notifications", {
      id: randomUUID(),
      ownerId,
      title,
      message,
      createdAt: now(),
      read: false,
    });
  const queue = (order) => {
    if (order.targetServiceId) {
      const service = store.get("services", order.targetServiceId);
      if (!service || service.ownerId !== order.ownerId)
        throw new Error("Serviço do adicional não encontrado.");
      if (service.addonOrderIds?.includes(order.id)) return;
      store.put("services", {
        ...service,
        quote: order.updatedServiceQuote,
        cost: order.updatedServiceQuote.monthlyEquivalent / 100,
        addonOrderIds: [...(service.addonOrderIds || []), order.id],
      });
      notify(
        order.ownerId,
        "Adicional contratado",
        `${service.name}: configuração de demonstração atualizada após confirmação do pedido.`,
      );
      return;
    }
    const id = randomUUID();
    return store.put("jobs", {
      id,
      ownerId: order.ownerId,
      orderId: order.id,
      status: "queued",
      progress: 0,
      message: production
        ? "Aguardando provisionamento na infraestrutura"
        : "Aguardando worker de demonstração",
      createdAt: now(),
      serviceId: randomUUID(),
    });
  };
  const billing = billingProvider({
    store,
    key: options.stripeKey ?? config.stripeKey,
    webhookSecret: options.webhookSecret ?? config.stripeWebhook,
    origin: options.origin ?? config.origin,
    production,
    mail,
    supportEmail: config.supportEmail,
    canCharge: (ownerId) => launch?.canCharge(ownerId) === true,
    onSubscriptionDeleted: async (order) => {
      for (const service of store
        .all("services")
        .filter((s) => s.orderId === order.id)) {
        await provider.action(service.id, "stop");
        store.put("services", { ...service, status: "Cancelado" });
      }
    },
    stripeClient: options.stripeClient,
    notify,
    queue,
  });
  const own = (kind, id, user) => {
    const item = store.get(kind, id);
    if (!item || item.ownerId !== user.id) fail(404, "Recurso não encontrado.");
    return item;
  };
  function seedUser() {
    const id = randomUUID();
    const user = store.put("users", {
      id,
      name: "Vinícius Costa",
      identityVerified: false,
      paymentVerified: false,
      createdAt: now(),
    });
    const seeds = [
      ["Survival dos amigos", "Minecraft Java", "Jogos", 4, 2, 30, 2.4, 8.2],
      ["Nexora Assistant", "Node.js", "Bots Discord", 1, 1, 10, 0.18, 0.4],
      ["Meu portfólio", "Next.js", "Sites", 2, 1, 20, 0.32, 1.1],
    ];
    for (const [
      name,
      type,
      category,
      ram,
      cpu,
      disk,
      usedRam,
      usedDisk,
    ] of seeds) {
      const q = quote({ category, ram, cpu, disk });
      const serviceId = randomUUID();
      store.put("services", {
        id: serviceId,
        ownerId: id,
        name,
        type,
        category,
        icon:
          category === "Jogos" ? "⛏" : category === "Sites" ? "globe" : "bot",
        style:
          category === "Jogos"
            ? "minecraft"
            : category === "Sites"
              ? "website"
              : "discord",
        status: "Online",
        cpu: 12,
        ram: usedRam,
        total: ram,
        disk: usedDisk,
        capacity: disk,
        address: `${serviceId.slice(0, 8)}.demo.invalid`,
        cost: q.monthlyEquivalent / 100,
        quote: q,
        onboarding: { tourSeen: true, steps: {} },
        demo: true,
        createdAt: now(),
      });
    }
    return user;
  }
  async function body(req, raw = false) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 800000) fail(413, "Requisição muito grande.");
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (raw) return buffer;
    try {
      const value = buffer.length ? JSON.parse(buffer.toString("utf8")) : {};
      if (!value || typeof value !== "object" || Array.isArray(value))
        fail(400, "Envie um objeto JSON válido.");
      return value;
    } catch {
      fail(400, "JSON inválido.");
    }
  }
  function getSession(req) {
    if (production || config.requireLogin) return auth.getSession(req);
    const cookie = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("nexora_session="))
      ?.slice(15);
    const session = cookie && store.get("sessions", hash(cookie));
    return session && session.expires > Date.now() ? session : null;
  }
  const planActive = (ownerId, plan) =>
    store.all("invoices").some((i) => {
      const order = store.get("orders", i.orderId);
      if (
        i.ownerId !== ownerId ||
        i.status !== "paid" ||
        order?.quote.specs.agency !== plan
      )
        return false;
      const expiry = new Date(i.date);
      expiry.setUTCMonth(expiry.getUTCMonth() + order.quote.months);
      return expiry.getTime() > Date.now();
    });
  const publicAffiliate = (a) => {
    if (!a) return null;
    const { stripeAccountId, ...publicData } = a;
    return { ...publicData, planActive: planActive(a.id, a.plan) };
  };
  function calculate(input, user) {
    if (
      production &&
      (input.referralCode ||
        input.template ||
        (input.agency && input.agency !== "personal") ||
        Object.values(input.addons || {}).some(Boolean))
    )
      fail(
        400,
        "Afiliados, templates, revenda e adicionais não estão disponíveis no lançamento.",
      );
    const affiliate = input.referralCode
      ? store.all("affiliates").find((a) => a.code === input.referralCode)
      : null;
    if (affiliate?.id === user.id)
      fail(
        400,
        "Autoindicação não permitida. Remova seu próprio código de indicação.",
      );
    if (input.referralCode && !affiliate)
      fail(400, "Código de indicação inválido.");
    try {
      return {
        quote: quote(
          input,
          affiliate?.plan === "reseller" && planActive(affiliate.id, "reseller")
            ? affiliate.margin
            : 0,
        ),
        affiliate,
      };
    } catch {
      fail(
        400,
        "Recursos ou plano inválidos. Revise RAM, CPU, disco, região e ciclo.",
      );
    }
  }
  async function handler(req, res) {
    securityHeaders(res, production);
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    if (production)
      res.on("finish", () => {
        try {
          store.db
            .prepare("INSERT INTO access_logs VALUES (?,?,?,?,?)")
            .run(
              now(),
              clientIp(req),
              req.method,
              new URL(req.url, "http://localhost").pathname.slice(0, 300),
              res.statusCode,
            );
        } catch {}
      });
    const send = (status, value) => {
      if(res.destroyed||res.writableEnded)return;
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      if (!path.startsWith("/api/")) {
        if (production)
          return await serveWeb(
            req,
            res,
            options.distDir || join(process.cwd(), "dist"),
          );
        return send(404, { error: "Rota não encontrada." });
      }
      const ip = clientIp(req);
      if (!limiter.allow(`ip:${ip}`, options.ipLimit || 600))
        fail(429, "Limite por IP atingido. Tente novamente em um minuto.");
      // Vite preserves Host. Reject cross-site mutations; no CORS wildcard and no trust in forwarded IPs.
      if (
        !["GET", "HEAD"].includes(req.method) &&
        !["/api/billing/webhook", "/api/mail/webhook"].includes(path)
      ) {
        if (req.headers["sec-fetch-site"] === "cross-site")
          fail(403, "Origem não permitida.");
        if (
          req.headers.origin &&
          (production
            ? req.headers.origin !== config.origin
            : new URL(req.headers.origin).host !== req.headers.host)
        )
          fail(403, "Origem não permitida.");
        if (!req.headers["content-type"]?.startsWith("application/json"))
          fail(415, "Use application/json.");
      }
      if (path === "/api/public/config" && req.method === "GET")
        return send(200, {
          ...publicRuntime(config),
          requireLogin: production || config.requireLogin === true,
          categories: production
            ? launch?.status().provider?.categories || []
            : Object.keys(TABLE.types),
          capabilities: production ? launch?.status().provider || null : null,
          checkoutAvailable: production
            ? launch?.status().ready && config.publicCheckout
            : false,
        });
      if (path === "/api/health" && req.method === "GET") {
        store.db.prepare("SELECT 1").get();
        return send(
          200,
          production
            ? { ok: true, instanceId }
            : {
                ok: true,
                mode: "demo",
                worker: "sqlite-simulation",
                stripe: billing.configured ? "test" : "unconfigured",
              },
        );
      }
      if (path === "/api/ready" && req.method === "GET") {
        const ready = production ? launch.status().ready : true;
        return send(ready ? 200 : 503, {
          status: ready ? "ready" : "not-ready",
        });
      }
      if (path === "/api/mail/webhook" && req.method === "POST")
        return send(
          200,
          await mail.webhook(await body(req, true), req.headers),
        );
      const handledAuth = await auth.handle({ path, req, res, body, ip });
      if (handledAuth) return send(handledAuth.status, handledAuth.data);
      if (
        production &&
        (/^\/api\/(affiliate|storefront|catalog|licenses|uploads)/.test(path) ||
          /^\/api\/admin\/payouts/.test(path))
      )
        fail(404, "Função não disponível nesta versão.");
      if (path === "/api/billing/webhook" && req.method === "POST")
        return send(
          200,
          await billing.webhook(
            await body(req, true),
            req.headers["stripe-signature"],
          ),
        );
      if (path.startsWith("/api/storefront/") && req.method === "GET") {
        const a = store
          .all("affiliates")
          .find((a) => a.code === path.split("/").pop());
        if (!a) fail(404, "Afiliado não encontrado.");
        return send(200, {
          code: a.code,
          brand:
            a.plan === "reseller" && planActive(a.id, "reseller")
              ? a.brand
              : { name: "nexora", color: "#8971dd", logo: "" },
          margin:
            a.plan === "reseller" && planActive(a.id, "reseller")
              ? a.margin
              : 0,
          domainStatus: a.domainStatus,
        });
      }
      if (path === "/api/session" && req.method === "POST") {
        if (production || config.requireLogin) {
          const current = getSession(req);
          return send(200, {
            user: current
              ? publicUser(store.get("users", current.ownerId))
              : null,
            role: current?.role || null,
            mode: production ? "production" : "development",
          });
        }
        let session = getSession(req);
        if (!session) {
          if (!limiter.allow(`signup:${ip}`, 10))
            fail(429, "Limite de sessões de demonstração atingido.");
          const token = randomBytes(32).toString("hex");
          const user = seedUser();
          session = store.put("sessions", {
            id: hash(token),
            ownerId: user.id,
            role: "customer",
            expires: Date.now() + 7 * 86400000,
          });
          res.setHeader(
            "Set-Cookie",
            `nexora_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${req.socket.encrypted ? "; Secure" : ""}`,
          );
        }
        return send(200, {
          user: publicUser(store.get("users", session.ownerId)),
          role: session.role,
          mode: "demo",
        });
      }
      const session = getSession(req);
      if (!session)
        fail(
          401,
          production || config.requireLogin
            ? "Entre na sua conta para continuar."
            : "Abra uma sessão de demonstração para continuar.",
        );
      if (
        !limiter.allow(
          `account:${session.ownerId}`,
          options.accountLimit || 300,
        )
      )
        fail(429, "Limite por conta atingido. Tente novamente em um minuto.");
      const user = store.get("users", session.ownerId);
      if (!user) fail(401, "Sessão inválida. Entre novamente.");
      if (path === "/api/admin/session" && req.method === "POST") {
        if (!limiter.allow(`admin:${ip}`, 5))
          fail(429, "Muitas tentativas de autenticação administrativa.");
        const input = await body(req);
        if (
          typeof input.token !== "string" ||
          !safeEqual(input.token, adminToken)
        )
          fail(403, "Token administrativo inválido.");
        if (production && !config.adminEmails.includes(user.email))
          fail(403, "Conta sem acesso administrativo.");
        if (production || config.requireLogin)
          auth.issue(res, user, "admin", session);
        else store.put("sessions", { ...session, role: "admin" });
        return send(200, { role: "admin" });
      }
      if (path.startsWith("/api/admin/") && session.role !== "admin")
        fail(403, "Acesso administrativo necessário.");
      if (path === "/api/branding" && req.method === "GET") {
        const host = (req.headers.host || "").split(":")[0].toLowerCase();
        const affiliate = store
          .all("affiliates")
          .find(
            (a) =>
              a.domain === host &&
              a.domainStatus === "verified" &&
              a.plan === "reseller" &&
              planActive(a.id, "reseller"),
          );
        return send(200, {
          brand: affiliate?.brand || null,
          referralCode: affiliate?.code || null,
        });
      }
      if (path === "/api/me" && req.method === "GET")
        return send(200, {
          user: publicUser(user),
          role: session.role,
          affiliate: publicAffiliate(store.get("affiliates", user.id)),
          stripeConfigured: billing.configured,
          production,
          canCheckout: production ? launch.canCharge(user.id) : true,
        });
      if (path === "/api/admin/launch" && req.method === "GET")
        return send(200, {
          ...launch.status(),
          backup: store.get("system", "backup"),
          mailEvents: store
            .all("mailOutbox")
            .map(
              ({
                id,
                ownerId,
                kind,
                status,
                providerId,
                error,
                createdAt,
              }) => ({
                id,
                ownerId,
                kind,
                status,
                providerId,
                error,
                createdAt,
              }),
            ),
        });
      if (path === "/api/admin/launch/probe" && req.method === "POST") {
        await launch.probe();
        return send(200, launch.status());
      }
      if (path === "/api/admin/backup" && req.method === "POST") {
        await backups.run(true);
        return send(200, store.get("system", "backup"));
      }
      const cancelMatch = path.match(
        /^\/api\/orders\/([^/]+)\/cancel-renewal$/,
      );
      if (cancelMatch && req.method === "POST") {
        const order = own("orders", cancelMatch[1], user);
        if (!production) fail(400, "Disponível em produção.");
        return send(200, await billing.cancelRenewal(order));
      }
      if (path === "/api/pricing" && req.method === "GET")
        return send(200, TABLE);
      if (path === "/api/policy" && req.method === "GET")
        return send(200, POLICY);
      if (path === "/api/quote" && req.method === "POST")
        return send(200, calculate(await body(req), user).quote);
      if (path === "/api/catalog" && req.method === "GET")
        return send(200, {
          products: CATALOG,
          platformFee: TABLE.marketplaceFee,
        });
      if (path === "/api/licenses" && req.method === "GET")
        return send(
          200,
          store
            .all("marketplaceSales")
            .filter((s) => s.ownerId === user.id)
            .map((s) => ({
              ...s,
              product: CATALOG.find((p) => p.id === s.template),
            })),
        );
      const licenseMatch = path.match(/^\/api\/licenses\/([^/]+)\/download$/);
      if (licenseMatch && req.method === "GET") {
        const sale = own("marketplaceSales", licenseMatch[1], user);
        const archive = templateArchive(sale.template);
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="nexora-${sale.template}.zip"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(archive);
      }
      if (path === "/api/services" && req.method === "GET")
        return send(
          200,
          store.all("services").filter((s) => s.ownerId === user.id),
        );
      if (path === "/api/notifications" && req.method === "GET")
        return send(
          200,
          store
            .all("notifications")
            .filter((s) => s.ownerId === user.id)
            .reverse(),
        );
      if (path === "/api/subscriptions" && req.method === "GET")
        return send(
          200,
          store
            .all("orders")
            .filter(
              (o) => o.ownerId === user.id && o.live && o.status === "paid",
            )
            .map(
              ({ id, name, cancelAtPeriodEnd, subscriptionStatus, quote }) => ({
                id,
                name,
                cancelAtPeriodEnd,
                subscriptionStatus,
                renewal: quote.renewal,
                months: quote.months,
              }),
            ),
        );
      if (path === "/api/invoices" && req.method === "GET")
        return send(
          200,
          store
            .all("invoices")
            .filter((s) => s.ownerId === user.id)
            .reverse(),
        );
      if (path === "/api/notifications/read" && req.method === "POST") {
        for (const n of store
          .all("notifications")
          .filter((n) => n.ownerId === user.id))
          store.put("notifications", { ...n, read: true });
        return send(200, { ok: true });
      }
      if (path === "/api/uploads" && req.method === "POST") {
        if (!limiter.allow(`uploads:${user.id}`, 5))
          fail(429, "Máximo de 5 uploads por minuto.");
        const input = await body(req);
        const upload = await scanUpload({
          ...input,
          dataDir,
          scanner: options.scanner || "clamscan",
        });
        store.put("uploads", { ...upload, ownerId: user.id });
        if (upload.status === "infected")
          notify(
            user.id,
            "Upload bloqueado",
            "Malware identificado. O arquivo foi removido da quarentena e não será executado.",
          );
        return send(upload.status === "clean" ? 201 : 422, {
          ...upload,
          error:
            upload.status === "clean"
              ? undefined
              : "Upload bloqueado: scanner indisponível, erro ou ameaça detectada. Nenhum arquivo foi executado.",
        });
      }
      if (path === "/api/orders" && req.method === "POST") {
        if (!limiter.allow(`orders:${user.id}`, 10))
          fail(429, "Máximo de 10 pedidos por minuto.");
        const input = await body(req);
        if (production) {
          if (!user.emailVerified)
            fail(403, "Confirme seu e-mail antes de comprar.");
          if (input.paymentMode !== "stripe")
            fail(400, "Pedidos de demonstração são proibidos em produção.");
          if (input.acceptedLegalVersion !== LEGAL_VERSION)
            fail(
              400,
              "Leia e aceite os Termos, Privacidade e Reembolso antes da compra.",
            );
          if (!launch.canCharge(user.id))
            fail(
              503,
              "Contratações ainda não liberadas. Entre em contato com o suporte.",
            );
        }
        if (!limiter.allow(`checkout-ip:${ip}`, 10))
          fail(429, "Muitas tentativas de checkout. Aguarde um minuto.");
        if (production && input.uploadId)
          fail(400, "Uploads não estão disponíveis no lançamento.");
        if (
          typeof input.requestId !== "string" ||
          !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)
        )
          fail(400, "Identificador de pedido inválido.");
        const previous = store
          .all("orders")
          .find(
            (o) => o.ownerId === user.id && o.requestId === input.requestId,
          );
        if (previous) {
          if (
            previous.status === "awaiting-payment" &&
            previous.paymentMode === "stripe"
          )
            return send(200, {
              order: previous,
              ...(await billing.checkout(previous)),
            });
          return send(200, {
            order: previous,
            job: store.all("jobs").find((j) => j.orderId === previous.id),
          });
        }
        if (!["stripe", "demo"].includes(input.paymentMode))
          fail(400, "Escolha demo ou stripe test mode.");
        if (input.paymentMode === "stripe" && !billing.configured)
          fail(503, "Stripe test mode não configurado.");
        if (input.acceptedPolicy !== POLICY.version)
          fail(400, "Aceite a política de uso para continuar.");
        const { quote: q, affiliate } = calculate(input, user);
        if (production && !launch.supports(q.specs, input.subtype))
          fail(400, "Configuração ainda não disponível na infraestrutura.");
        if (input.expectedTotal !== q.total || input.priceVersion !== q.version)
          fail(409, "O preço mudou. Revise a cotação antes de confirmar.");
        if (
          q.requiresVerification &&
          (!user.identityVerified || !user.paymentVerified)
        )
          fail(
            403,
            "Recursos acima de 8 GB RAM, 4 vCPU ou 100 GB disco exigem verificação administrativa de identidade e pagamento.",
          );
        if (input.uploadId) {
          const upload = own("uploads", input.uploadId, user);
          if (upload.status !== "clean")
            fail(422, "Arquivo sem scan aprovado.");
        }
        if (
          typeof input.name !== "string" ||
          input.name.trim().length < 2 ||
          input.name.length > 80
        )
          fail(400, "Nome deve conter de 2 a 80 caracteres.");
        const allowedTypes = {
          Jogos: ["Minecraft", "FiveM", "Rust", "ARK"],
          "Bots Discord": ["Node.js", "Python"],
          Sites: ["Next.js", "Estático", "PHP", "Python / Django"],
        };
        if (!allowedTypes[q.specs.category].includes(input.subtype))
          fail(400, "Tecnologia incompatível com a categoria.");
        const order = store.put("orders", {
          id: randomUUID(),
          ownerId: user.id,
          name: input.name.trim(),
          paymentMode: input.paymentMode,
          subtype: input.subtype,
          quote: q,
          requestId: input.requestId,
          referrerId: affiliate?.id || null,
          uploadId: input.uploadId || null,
          status: "awaiting-payment",
          createdAt: now(),
          policyVersion: POLICY.version,
          customerEmail: production ? user.email : null,
          legalAcceptance: production
            ? { version: LEGAL_VERSION, date: now() }
            : null,
        });
        if (input.paymentMode === "stripe")
          return send(201, { order, ...(await billing.checkout(order)) });
        if (input.paymentMode !== "demo")
          fail(400, "Escolha demo ou stripe test mode.");
        billing.recordDemo(order);
        return send(201, {
          order: store.get("orders", order.id),
          job: store.all("jobs").find((j) => j.orderId === order.id),
        });
      }
      if (path === "/api/jobs" && req.method === "GET")
        return send(
          200,
          store.all("jobs").filter((j) => j.ownerId === user.id),
        );
      if (path.startsWith("/api/jobs/") && req.method === "GET")
        return send(200, own("jobs", path.split("/")[3], user));
      const serviceMatch = path.match(
        /^\/api\/services\/([^/]+)(?:\/(onboarding|action|addons|invitations|setup))?$/,
      );
      if (serviceMatch) {
        const service = own("services", serviceMatch[1], user);
        const action = serviceMatch[2];
        if (production && ["addons", "setup", "invitations"].includes(action))
          fail(404, "Função prevista para uma próxima atualização.");
        if (!action && req.method === "GET") {
          if (production) {
            try {
              const state = await provider.get(service.id);
              const statuses = {
                ready: "Online",
                stopped: "Offline",
                offline: "Offline",
                restarting: "Reiniciando",
                provisioning: "Provisionando",
                failed: "Indisponível",
              };
              if (!statuses[state.status])
                fail(502, "Estado do serviço não reconhecido.");
              const m = state.metrics;
              const available =
                m &&
                ["cpuPercent", "ramGB", "diskGB"].every(
                  (k) => Number.isFinite(m[k]) && m[k] >= 0,
                ) &&
                m.cpuPercent <= 100;
              const next = store.put("services", {
                ...service,
                status:
                  ['Suspenso','Cancelado'].includes(service.status)
                    ? service.status
                    : statuses[state.status],
                metricsAvailable: Boolean(available),
                cpu: available ? m.cpuPercent : 0,
                ram: available ? m.ramGB : 0,
                disk: available ? m.diskGB : 0,
                lastCheckedAt: now(),
                observationStale: false,
              });
              return send(200, next);
            } catch {
              return send(200, {
                ...service,
                observationStale: true,
                metricsAvailable: false,
              });
            }
          }
          return send(200, service);
        }
        if (action === "setup" && req.method === "PATCH") {
          const input = await body(req);
          if (
            typeof input.address !== "string" ||
            input.address.length > 253 ||
            !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.test(input.address) ||
            !input.address.includes(".")
          )
            fail(
              400,
              "Informe um domínio ou IPv4 válido, sem porta ou protocolo.",
            );
          return send(
            200,
            store.put("services", {
              ...service,
              customAddress: input.address.toLowerCase(),
              domainStatus: "pending-infrastructure",
            }),
          );
        }
        if (action === "invitations" && req.method === "GET")
          return send(
            200,
            store
              .all("invitations")
              .filter(
                (i) => i.ownerId === user.id && i.serviceId === service.id,
              ),
          );
        if (action === "invitations" && req.method === "POST") {
          const input = await body(req);
          if (
            typeof input.email !== "string" ||
            input.email.length > 200 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
            !["viewer", "operator"].includes(input.role)
          )
            fail(400, "E-mail ou permissão inválida.");
          const invitations = store
            .all("invitations")
            .filter((i) => i.serviceId === service.id);
          if (invitations.length >= 10)
            fail(400, "Máximo de 10 convites por serviço nesta versão.");
          if (invitations.some((i) => i.email === input.email.toLowerCase()))
            fail(409, "Já existe um convite para este e-mail.");
          const invitation = store.put("invitations", {
            id: randomUUID(),
            serviceId: service.id,
            ownerId: user.id,
            email: input.email.toLowerCase(),
            role: input.role,
            status: "pending-email-integration",
            createdAt: now(),
          });
          notify(
            user.id,
            "Convite registrado",
            `${service.name}: convite para ${invitation.email} pendente de integração de e-mail e autenticação. Nenhum acesso foi concedido.`,
          );
          return send(201, invitation);
        }
        if (action === "onboarding" && req.method === "PATCH") {
          const input = await body(req);
          const permitted = ["domain", "connection", "backup", "collaborators"];
          if (input.step && !permitted.includes(input.step))
            fail(400, "Etapa inválida.");
          const onboarding = {
            ...service.onboarding,
            tourSeen: input.tourSeen === true || service.onboarding?.tourSeen,
            steps: { ...service.onboarding?.steps },
          };
          if (input.step) onboarding.steps[input.step] = input.done === true;
          return send(200, store.put("services", { ...service, onboarding }));
        }
        if (action === "action" && req.method === "POST") {
          const input = await body(req);
          if (!["start", "stop", "restart", "rename"].includes(input.action))
            fail(400, "Ação inválida.");
          if (
            ["Suspenso", "Cancelado"].includes(service.status) &&
            input.action !== "rename"
          )
            fail(
              403,
              "Serviço suspenso por abuso. Solicite revisão no suporte.",
            );
          if (
            input.action === "rename" &&
            (typeof input.name !== "string" ||
              input.name.trim().length < 2 ||
              input.name.length > 80)
          )
            fail(400, "Nome inválido.");
          if(production&&input.action!=='rename'&&store.get('orders',service.orderId)?.subscriptionStatus==='cancelled')fail(403,'A assinatura deste serviço foi encerrada.');
          if (production && input.action !== "rename")
            await provider.action(service.id, input.action);
          return send(
            200,
            store.put("services", {
              ...service,
              status:
                input.action === "stop"
                  ? "Offline"
                  : input.action === "rename"
                    ? service.status
                    : "Online",
              name:
                input.action === "rename" ? input.name.trim() : service.name,
            }),
          );
        }
        if (action === "addons" && req.method === "POST") {
          const input = await body(req);
          if (input.confirm && typeof input.requestId === "string") {
            const previous = store
              .all("orders")
              .find(
                (o) => o.ownerId === user.id && o.requestId === input.requestId,
              );
            if (previous) {
              if (previous.targetServiceId !== service.id)
                fail(409, "Identificador já usado em outro pedido.");
              return send(200, { service, order: previous });
            }
          }

          const q = quote(
            {
              ...service.quote.specs,
              addons: { ...service.quote.specs.addons, ...input.addons },
            },
            service.quote.margin,
          );
          for (const [key, quantity] of Object.entries(
            service.quote.specs.addons,
          ))
            if ((q.specs.addons[key] || 0) < quantity)
              fail(400, "Remoções e downgrades exigem revisão do suporte.");
          const chargeCents = q.recurring - service.quote.recurring;
          if (chargeCents <= 0)
            fail(400, "Selecione ao menos um adicional novo.");
          if (!input.confirm)
            return send(200, {
              quote: q,
              chargeCents,
              previousTotal: service.quote.total,
              message:
                "Cobrança adicional de um ciclo completo, sem pró-rata. Nenhuma alteração antes da confirmação. Somente demonstração.",
            });
          if (!limiter.allow(`addons:${user.id}`, 10))
            fail(429, "Máximo de 10 contratações de adicionais por minuto.");
          if (service.status === "Suspenso")
            fail(403, "Serviço suspenso não pode contratar adicionais.");
          if (input.paymentMode !== "demo")
            fail(
              400,
              "Adicionais de serviços existentes estão disponíveis apenas em demonstração.",
            );
          if (
            typeof input.requestId !== "string" ||
            !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)
          )
            fail(400, "Identificador do pedido inválido.");
          const previous = store
            .all("orders")
            .find(
              (o) => o.ownerId === user.id && o.requestId === input.requestId,
            );
          if (previous) return send(200, { service, order: previous });
          if (
            input.expectedCharge !== chargeCents ||
            input.previousTotal !== service.quote.total
          )
            fail(409, "A configuração mudou. Revise a cotação do adicional.");
          const original = store.get("orders", service.orderId);
          const difference = {
            ...q,
            specs: { ...q.specs, agency: "personal", template: null },
            monthly: q.monthly - service.quote.monthly,
            monthlyEquivalent:
              q.monthlyEquivalent - service.quote.monthlyEquivalent,
            marginCents: q.marginCents - service.quote.marginCents,
            recurring: chargeCents,
            once: 0,
            total: chargeCents,
            renewal: chargeCents,
          };
          const addonOrder = store.put("orders", {
            id: randomUUID(),
            ownerId: user.id,
            requestId: input.requestId,
            targetServiceId: service.id,
            updatedServiceQuote: q,
            quote: difference,
            name: `Adicionais · ${service.name}`,
            subtype: service.type,
            referrerId: original?.referrerId || null,
            status: "awaiting-payment",
            paymentMode: "demo",
            createdAt: now(),
          });
          billing.recordDemo(addonOrder);
          return send(201, {
            service: store.get("services", service.id),
            order: store.get("orders", addonOrder.id),
          });
        }
      }
      if (path === "/api/affiliate" && req.method === "GET") {
        const a = store.get("affiliates", user.id);
        return send(200, {
          affiliate: publicAffiliate(a),
          commissions: store
            .all("commissions")
            .filter((c) => c.affiliateId === user.id)
            .map(({ customerId, ...c }) => c),
          payouts: store
            .all("payouts")
            .filter((p) => p.affiliateId === user.id),
          referredCustomers: new Set(
            store
              .all("commissions")
              .filter((c) => c.affiliateId === user.id)
              .map((c) => c.customerId),
          ).size,
          stripeConfigured: billing.configured,
        });
      }
      if (path === "/api/affiliate" && req.method === "PUT") {
        const input = await body(req);
        const previous = store.get("affiliates", user.id);
        if (!["personal", "agency", "reseller"].includes(input.plan))
          fail(400, "Plano inválido.");
        if (
          !Number.isInteger(input.margin) ||
          input.margin < 0 ||
          input.margin > 40
        )
          fail(400, "A margem deve ficar entre 0% e 40%.");
        if (
          typeof input.name !== "string" ||
          input.name.trim().length < 2 ||
          input.name.length > 45
        )
          fail(400, "Marca deve conter de 2 a 45 caracteres.");
        if (!/^#[0-9a-f]{6}$/i.test(input.color)) fail(400, "Cor inválida.");
        if (
          input.logo &&
          (typeof input.logo !== "string" ||
            input.logo.length > 500 ||
            !/^https:\/\/[^\s]+$/i.test(input.logo))
        )
          fail(400, "Informe uma URL HTTPS para o logo.");
        const domain = String(input.domain || "")
          .toLowerCase()
          .trim();
        if (
          domain &&
          (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
            domain,
          ) ||
            domain.length > 253)
        )
          fail(400, "Informe somente o hostname do subdomínio.");
        if (
          domain &&
          store
            .all("affiliates")
            .some(
              (a) =>
                a.id !== user.id &&
                a.domain === domain &&
                a.domainStatus === "verified",
            )
        )
          fail(409, "Domínio já vinculado.");
        const sameDomain = previous?.domain === domain;
        const value = {
          ...previous,
          id: user.id,
          code: previous?.code || randomBytes(6).toString("hex"),
          plan: input.plan,
          margin: input.margin,
          brand: {
            name: input.name.trim(),
            color: input.color,
            logo: input.logo || "",
          },
          domain,
          domainStatus: sameDomain
            ? previous.domainStatus
            : domain
              ? "pending-dns"
              : "none",
          dnsToken: sameDomain
            ? previous.dnsToken
            : `nexora=${randomBytes(20).toString("hex")}`,
          connectStatus: previous?.connectStatus || "unconfigured",
          updatedAt: now(),
        };
        return send(200, publicAffiliate(store.put("affiliates", value)));
      }
      if (path === "/api/affiliate/domain/verify" && req.method === "POST") {
        const a = store.get("affiliates", user.id);
        if (!a?.domain) fail(400, "Cadastre um subdomínio antes de verificar.");
        if (!limiter.allow(`dns:${user.id}`, 3))
          fail(429, "Aguarde um minuto antes de verificar novamente.");
        let records;
        try {
          records = await resolveTxt(`_nexora.${a.domain}`);
        } catch {
          fail(
            422,
            "Registro TXT ainda não encontrado. Aguarde a propagação DNS.",
          );
        }
        if (!records.some((r) => r.join("") === a.dnsToken))
          fail(422, "TXT não corresponde à chave de verificação.");
        if (
          store
            .all("affiliates")
            .some(
              (x) =>
                x.id !== user.id &&
                x.domain === a.domain &&
                x.domainStatus === "verified",
            )
        )
          fail(409, "Domínio já vinculado.");
        return send(
          200,
          publicAffiliate(
            store.put("affiliates", { ...a, domainStatus: "verified" }),
          ),
        );
      }
      if (path === "/api/affiliate/connect" && req.method === "POST") {
        const a = store.get("affiliates", user.id);
        if (!a) fail(400, "Cadastre seu programa antes de conectar.");
        return send(200, await billing.connect(a));
      }
      if (path === "/api/admin/overview" && req.method === "GET")
        return send(200, {
          users: store.all("users").map(publicUser),
          services: store.all("services"),
          jobs: store.all("jobs"),
          incidents: store.all("incidents").reverse(),
          payouts: store.all("payouts"),
          sales: store.all("marketplaceSales"),
          commissions: store.all("commissions"),
          integrations: {
            runtime: "Simulado — nenhum container ou VM executado",
            telemetry:
              "Ingestão administrativa pronta; coletor de tráfego não conectado",
            scanner: "ClamAV obrigatório; falha bloqueia uploads",
            stripe: billing.configured
              ? "Stripe test mode configurado"
              : "Não configurado",
            payouts:
              "Agendamento mensal ativo; transferências apenas com Connect pronto e Stripe test mode",
            email: "Notificações internas ativas; e-mail não conectado",
          },
          policy: POLICY,
        });
      if (path === "/api/admin/verify" && req.method === "POST") {
        const input = await body(req);
        const target = store.get("users", input.userId);
        if (!target) fail(404, "Usuário não encontrado.");
        if (
          typeof input.reference !== "string" ||
          input.reference.trim().length < 8 ||
          input.reference.length > 200
        )
          fail(
            400,
            "Informe a referência da revisão manual (mínimo 8 caracteres).",
          );
        const updated = store.put("users", {
          ...target,
          identityVerified: input.identityVerified === true,
          paymentVerified: input.paymentVerified === true,
          verifiedAt: now(),
        });
        store.put("audit", {
          id: randomUUID(),
          actor: user.id,
          action: "verification",
          target: target.id,
          reference: input.reference,
          createdAt: now(),
        });
        notify(
          target.id,
          "Verificação atualizada",
          `Identidade: ${updated.identityVerified ? "aprovada" : "pendente"}. Pagamento: ${updated.paymentVerified ? "aprovado" : "pendente"}.`,
        );
        return send(200, publicUser(updated));
      }
      if (path === "/api/admin/telemetry" && req.method === "POST") {
        const input = await body(req);
        const service = store.get("services", input.serviceId);
        if (!service) fail(404, "Serviço não encontrado.");
        for (const k of [
          "connectionsPerMinute",
          "smtpAttempts",
          "abuseReports",
        ])
          if (!Number.isInteger(input[k]) || input[k] < 0 || input[k] > 1e9)
            fail(400, "Contadores de tráfego inválidos.");
        const suspicious = Object.keys(POLICY.thresholds).some(
          (k) => input[k] >= POLICY.thresholds[k],
        );
        store.put("telemetry", { ...input, id: service.id, updatedAt: now() });
        if (suspicious && service.status !== "Suspenso") {
          if(production)await provider.action(service.id,'stop');
          store.put("services", {
            ...service,
            status: "Suspenso",
            suspensionReason:
              "Limite de abuso excedido em evento administrativo de tráfego",
          });
          store.put("incidents", {
            id: randomUUID(),
            ownerId: service.ownerId,
            serviceId: service.id,
            name: service.name,
            severity: "high",
            status: "open",
            evidence: input,
            createdAt: now(),
          });
          notify(
            service.ownerId,
            "Serviço suspenso por possível abuso",
            `${service.name}: limite de tráfego abusivo excedido. Abra um ticket para revisão. Seus dados foram preservados.`,
          );
        }
        return send(200, { suspended: suspicious, policy: POLICY.version });
      }
      if (path === "/api/admin/unsuspend" && req.method === "POST") {
        const input = await body(req);
        const service = store.get("services", input.serviceId);
        if (!service) fail(404, "Serviço não encontrado.");
        if (typeof input.reason !== "string" || input.reason.trim().length < 8)
          fail(400, "Informe o motivo da revisão.");
        store.put("services", {
          ...service,
          status: "Offline",
          suspensionReason: null,
        });
        for (const i of store
          .all("incidents")
          .filter((i) => i.serviceId === service.id && i.status === "open"))
          store.put("incidents", {
            ...i,
            status: "resolved",
            reason: input.reason,
            reviewer: user.id,
          });
        notify(
          service.ownerId,
          "Suspensão revisada",
          `${service.name}: serviço liberado após revisão. Inicie pelo painel.`,
        );
        return send(200, { ok: true });
      }
      if (path === "/api/admin/payouts/run" && req.method === "POST")
        return send(200, await billing.payoutPreviousMonth());
      return send(404, { error: "Rota não encontrada." });
    } catch (error) {
      const status = error.status || (production ? 500 : 400);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (status >= 500)
        console.error(
          JSON.stringify({ event: "request_failed", requestId, status }),
        );
      send(status, {
        error:
          status === 500
            ? "Não foi possível concluir a operação. Tente novamente ou contate o suporte."
            : error.status
              ? error.message
              : production
                ? "Solicitação inválida."
                : error.message,
        requestId,
      });
    }
  }

  function tickJobs() {
    for (const job of store
      .all("jobs")
      .filter((j) => ["queued", "running"].includes(j.status))) {
      try {
        const order = store.get("orders", job.orderId);
        if (!order || order.status !== "paid")
          throw new Error("Pedido sem pagamento confirmado.");
        if (
          order.uploadId &&
          store.get("uploads", order.uploadId)?.status !== "clean"
        )
          throw new Error("Arquivo não aprovado no scan.");
        const user = store.get("users", order.ownerId);
        if (
          order.quote.requiresVerification &&
          (!user.identityVerified || !user.paymentVerified)
        )
          throw new Error("Verificação de identidade/pagamento pendente.");
        const progress = Math.min(100, job.progress + 25);
        if (progress < 100) {
          store.put("jobs", {
            ...job,
            status: "running",
            progress,
            message: [
              "",
              "Validando política e recursos",
              "Preparando perfil de isolamento (simulação)",
              "Configurando serviço e onboarding (simulação)",
            ][progress / 25],
          });
          continue;
        }
        store.transaction(() => {
          const specs = order.quote.specs;
          const service = store.put("services", {
            id: job.serviceId,
            ownerId: order.ownerId,
            orderId: order.id,
            name: order.name,
            type: order.subtype,
            category: specs.category,
            icon:
              specs.category === "Jogos"
                ? "⛏"
                : specs.category === "Sites"
                  ? "globe"
                  : "bot",
            style:
              specs.category === "Jogos"
                ? "minecraft"
                : specs.category === "Sites"
                  ? "website"
                  : "discord",
            status: "Online",
            cpu: 0,
            ram: 0,
            disk: 0,
            total: specs.ram,
            capacity: specs.disk,
            address: `${job.serviceId.slice(0, 8)}.demo.invalid`,
            cost: order.quote.monthlyEquivalent / 100,
            quote: order.quote,
            isolation: isolationProfile(specs, job.serviceId),
            demo: true,
            createdAt: now(),
            onboarding: { tourSeen: false, steps: {} },
            template: specs.template,
          });
          store.put("jobs", {
            ...job,
            status: "completed",
            progress: 100,
            message: "Serviço de demonstração pronto",
            completedAt: now(),
          });
          notify(
            job.ownerId,
            "Seu serviço está pronto",
            `${service.name} · ${service.type} · ${specs.region} · ${specs.ram} GB RAM. Próximos passos: configurar endereço, testar conexão, backup e colaboradores. Abra o serviço para o tour.`,
          );
        });
      } catch (e) {
        store.transaction(() => {
          store.remove("services", job.serviceId);
          store.put("jobs", {
            ...job,
            status: "failed",
            message: e.message,
            rolledBack: true,
          });
          notify(
            job.ownerId,
            "Falha no provisionamento",
            "Alterações locais revertidas. Pagamentos reais não são aceitos neste ambiente; revise o pedido com o suporte.",
          );
        });
      }
    }
  }
  launch = launchOperations({
    store,
    config,
    mail,
    backups,
    provider,
    billing,
    notify,
    instanceId,
    fetchPublic: options.fetchPublic,
  });
  const jobTimer = setInterval(
    () => (production ? track(launch.tick()).catch(() => {}) : tickJobs()),
    options.jobInterval || (production ? 3000 : 700),
  );
  jobTimer.unref();
  const payoutTimer = setInterval(
    () =>
      production ? undefined : billing.payoutPreviousMonth().catch(() => {}),
    60 * 60 * 1000,
  );
  payoutTimer.unref();
  const mailTimer = setInterval(() => track(mail.flush()).catch(() => {}), 10000);
  mailTimer.unref();
  const opsTimer = setInterval(() => {
    if (production) {
      track(backups.run()).catch(() => {});
      track(launch.probe()).catch(() => {});
      store.db
        .prepare("DELETE FROM access_logs WHERE created_at < ?")
        .run(new Date(Date.now() - 180 * 86400000).toISOString());
    }
    for (const kind of ["authTokens", "sessions"])
      for (const item of store.all(kind).filter((x) => x.expires < Date.now()))
        store.remove(kind, item.id);
  }, 60000);
  opsTimer.unref();
  const server = http.createServer(handler);
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 100;
  server.once("listening", () => {
    if (production && options.background!==false) {
      track(backups.run().then(() => launch.probe())).catch(() => {});
    }
  });
  return {
    server,
    store,
    billing,
    tickJobs,
    handler,
    config,
    auth,
    mail,
    backups,
    launch,
    async close() {
      if(closing)return;closing=true;mail.stop();launch.stop();
      clearInterval(jobTimer);
      clearInterval(payoutTimer);
      clearInterval(mailTimer);
      clearInterval(opsTimer);
      await new Promise(resolve=>server.close(resolve));
      await Promise.allSettled([...pending]);
      store.close();
    },
  };
}
