import { isAbsolute } from "node:path";
import { contactDefaults } from "../shared/contact.js";
import { validTaxId } from "./tax-id.js";
export const LEGAL_VERSION = "2026-10-23-v2";
export function loadRuntime(env = process.env, overrides = {}) {
  const production = overrides.production ?? env.NODE_ENV === "production";
  const c = {
    production,
    serviceDomain: env.PLATFORM_SERVICE_DOMAIN || "",
    requireLogin: production || env.REQUIRE_LOGIN === "true",
    origin: env.APP_ORIGIN || "",
    dataDir: env.DATA_DIR || "",
    supportEmail: env.SUPPORT_EMAIL || contactDefaults.supportEmail,
    privacyEmail:
      env.PRIVACY_EMAIL || env.SUPPORT_EMAIL || contactDefaults.privacyEmail,
    discord: env.SUPPORT_DISCORD_URL || "",
    discordUser: contactDefaults.discordUser,
    operator: env.OPERATOR_NAME || "",
    taxId: env.OPERATOR_TAX_ID || "",
    address: env.OPERATOR_ADDRESS || "",
    adminEmails: (env.ADMIN_EMAILS || "")
      .toLowerCase()
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    publicCheckout: env.PUBLIC_CHECKOUT_ENABLED === "true",
    launchTestEmail: (env.LAUNCH_TEST_EMAIL || "").toLowerCase(),
    stripeKey: env.STRIPE_SECRET_KEY || "",
    stripeWebhook: env.STRIPE_WEBHOOK_SECRET || "",
    resendKey: env.RESEND_API_KEY || "",
    resendWebhook: env.RESEND_WEBHOOK_SECRET || "",
    mailFrom: env.MAIL_FROM || "",
    appKey: env.APP_ENCRYPTION_KEY || "",
    backupKey: env.BACKUP_ENCRYPTION_KEY || "",
    backupBucket: env.BACKUP_S3_BUCKET || "",
    backupRegion: env.BACKUP_S3_REGION || "us-east-1",
    backupEndpoint: env.BACKUP_S3_ENDPOINT || "",
    backupPrefix: env.BACKUP_S3_PREFIX || "platform",
    provisionerUrl: env.PROVISIONER_URL || "",
    provisionerToken: env.PROVISIONER_TOKEN || "",
    trustedProxies: (env.TRUSTED_PROXIES || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    adminToken: env.NEXORA_ADMIN_TOKEN || "",
    ...overrides,
  };
  c.origin = c.origin.replace(/\/$/, "");
  c.provisionerUrl = c.provisionerUrl.replace(/\/$/, "");
  return c;
}
export function configIssues(c) {
  if (!c.production) return [];
  const missing = [];
  const require = (ok, name) => {
    if (!ok) missing.push(name);
  };
  const https = (v) => {
    try {
      const u = new URL(v);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        u.pathname === "/"
      );
    } catch {
      return false;
    }
  };
  const email = (v) =>
    typeof v === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) &&
    v.length <= 254;
  require(https(c.origin), "APP_ORIGIN (origem HTTPS)");
  require(isAbsolute(c.dataDir), "DATA_DIR (volume persistente absoluto)");
  require(email(c.supportEmail), "SUPPORT_EMAIL");
  require(email(c.privacyEmail), "PRIVACY_EMAIL");
  require(c.operator.trim().length >= 3, "OPERATOR_NAME");
  require(validTaxId(c.taxId), "OPERATOR_TAX_ID (CPF/CNPJ válido)");
  require(c.address.trim().length >= 10, "OPERATOR_ADDRESS");
  require(/^[a-f0-9]{64}$/i.test(c.appKey), "APP_ENCRYPTION_KEY (64 hex)");
  require(/^[a-f0-9]{64}$/i.test(
    c.backupKey,
  ), "BACKUP_ENCRYPTION_KEY (64 hex)");
  require(c.appKey !== c.backupKey, "chaves distintas de aplicação/backup");
  require(c.adminToken.length >=
    32, "NEXORA_ADMIN_TOKEN (mínimo 32 caracteres)");
  require(c.adminEmails.length > 0 &&
    c.adminEmails.every(email), "ADMIN_EMAILS");
  if (c.serviceDomain)
    require(/^(?!.*\.invalid$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(
      c.serviceDomain,
    ), "PLATFORM_SERVICE_DOMAIN (domínio real de serviços)");
  if (c.discord)
    require(/^https:\/\/(discord\.gg|discord\.com)\/[^\s]+$/.test(
      c.discord,
    ), "SUPPORT_DISCORD_URL");
  if (c.stripeKey)
    require(c.stripeKey.startsWith(
      "sk_live_",
    ), "STRIPE_SECRET_KEY (live, nunca test em produção)");
  if (c.provisionerUrl)
    require(https(c.provisionerUrl), "PROVISIONER_URL (origem HTTPS)");
  if (c.backupEndpoint)
    require(https(c.backupEndpoint), "BACKUP_S3_ENDPOINT (origem HTTPS)");
  return missing;
}
export function publicRuntime(c) {
  return {
    production: c.production,
    beta: true,
    publicCheckout: c.publicCheckout,
    supportEmail: c.supportEmail,
    privacyEmail: c.privacyEmail,
    discord: c.discord,
    discordUser: c.discordUser,
    operator: c.operator,
    taxId: c.taxId,
    address: c.address,
    legalVersion: LEGAL_VERSION,
    features: { growth: false, ai: false, uploads: false },
  };
}
