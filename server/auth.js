import {
  scrypt,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { LEGAL_VERSION } from "./runtime.js";
const derive = promisify(scrypt);
const digest = (v) => createHash("sha256").update(v).digest("hex");
const failure = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const publicUser = (u) =>
  u
    ? Object.fromEntries(
        Object.entries(u).filter(
          ([key]) => !["passwordHash", "passwordSalt"].includes(key),
        ),
      )
    : null;
const emailValue = (value) => {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    failure(400, "Informe um e-mail válido.");
  return value.trim().toLowerCase();
};
const passwordValue = (value) => {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    failure(400, "A senha deve ter de 12 a 128 caracteres.");
  return value;
};
let hashing = 0;
async function passwordHash(password, salt) {
  if (hashing >= 4)
    failure(503, "Muitas solicitações. Tente novamente em alguns instantes.");
  hashing++;
  try {
    return (
      await derive(password, salt, 64, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      })
    ).toString("hex");
  } finally {
    hashing--;
  }
}
export function authService({ store, config, limiter, mail }) {
  const cookieName = config.production
    ? "__Host-nexora_session"
    : "nexora_session";
  const usersByEmail = (email) =>
    store.all("users").find((u) => u.email === email);
  function issue(res, user, role = "customer", previous) {
    if (previous) store.remove("sessions", previous.id);
    const raw = randomBytes(32).toString("hex");
    const seconds = role === "admin" ? 1800 : 86400;
    const session = store.put("sessions", {
      id: digest(raw),
      ownerId: user.id,
      role,
      expires: Date.now() + seconds * 1000,
    });
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${config.production ? "; Secure" : ""}`,
    );
    return session;
  }
  function getSession(req) {
    const raw = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    const s = raw && store.get("sessions", digest(raw));
    return s && s.expires > Date.now() ? s : null;
  }
  function makeToken(user, purpose) {
    for (const t of store
      .all("authTokens")
      .filter((t) => t.ownerId === user.id && t.purpose === purpose))
      store.remove("authTokens", t.id);
    const token = randomBytes(32).toString("hex");
    store.put("authTokens", {
      id: digest(token),
      ownerId: user.id,
      purpose,
      expires: Date.now() + 3600000,
    });
    return token;
  }
  const limit = (key, n) => {
    if (!limiter.allow(key, n))
      failure(429, "Muitas tentativas. Aguarde um minuto e tente novamente.");
  };
  return {
    issue,
    getSession,
    async handle({ path, req, res, body, ip }) {
      if (!path.startsWith("/api/auth/")) return null;
      if (req.method !== "POST") failure(405, "Método não permitido.");
      limit(`auth-ip:${ip}`, 15);
      limit(`auth-path:${ip}:${path}`, path.endsWith("login") ? 5 : 3);
      const input = await body(req);
      if (
        !mail.configured &&
        !path.endsWith("logout") &&
        !path.endsWith("login") &&
        !path.endsWith("verify") &&
        !path.endsWith("reset")
      )
        failure(
          503,
          "Cadastro e recuperação temporariamente indisponíveis. Entre em contato com o suporte.",
        );
      if (path === "/api/auth/register") {
        const email = emailValue(input.email);
        const password = passwordValue(input.password);
        if (
          typeof input.name !== "string" ||
          input.name.trim().length < 2 ||
          input.name.length > 80
        )
          failure(400, "Nome deve conter de 2 a 80 caracteres.");
        if (
          input.legalVersion !== LEGAL_VERSION ||
          input.acceptedTerms !== true
        )
          failure(
            400,
            "Leia e aceite os Termos de Uso e a Política de Privacidade.",
          );
        const salt = randomBytes(16).toString("hex");
        const encoded = await passwordHash(password, salt);
        // Recheck after async hashing: simultaneous registrations cannot create duplicate accounts.
        if (!usersByEmail(email))
          store.transaction(() => {
            const user = store.put("users", {
              id: randomUUID(),
              email,
              name: input.name.trim(),
              passwordSalt: salt,
              passwordHash: encoded,
              emailVerified: false,
              identityVerified: false,
              paymentVerified: false,
              createdAt: new Date().toISOString(),
              legalAcceptance: {
                version: LEGAL_VERSION,
                date: new Date().toISOString(),
              },
            });
            const token = makeToken(user, "verify");
            mail.enqueue({
              id: `verify:${digest(token)}`,
              ownerId: user.id,
              kind: "verify",
              to: email,
              subject: "Confirme seu e-mail na Nexora",
              message: `Confirme seu e-mail para ativar sua conta. O link expira em uma hora.`,
              link: `${config.origin}/verificar-email?token=${token}`,
            });
          });
        return {
          status: 200,
          data: {
            message:
              "Se o endereço puder ser cadastrado, enviaremos um link de confirmação. Confira sua caixa de entrada e spam.",
          },
        };
      }
      if (path === "/api/auth/login") {
        const email = emailValue(input.email);
        limit(`auth-account:${digest(email)}`, 5);
        if (typeof input.password !== "string" || input.password.length > 128)
          failure(401, "E-mail ou senha inválidos.");
        const user = usersByEmail(email);
        const calculated = await passwordHash(
          input.password,
          user?.passwordSalt || "unregistered-account-salt",
        );
        if (
          !user?.passwordHash ||
          !timingSafeEqual(
            Buffer.from(calculated, "hex"),
            Buffer.from(user.passwordHash, "hex"),
          )
        )
          failure(401, "E-mail ou senha inválidos.");
        if (!user.emailVerified)
          failure(403, "Confirme seu e-mail antes de entrar.");
        const session = issue(res, user, "customer", getSession(req));
        return {
          status: 200,
          data: { user: publicUser(user), role: session.role },
        };
      }
      if (path === "/api/auth/logout") {
        const session = getSession(req);
        if (session) store.remove("sessions", session.id);
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${config.production ? "; Secure" : ""}`,
        );
        return { status: 200, data: { ok: true } };
      }
      if (path === "/api/auth/forgot" || path === "/api/auth/resend") {
        const email = emailValue(input.email);
        limit(`auth-email:${digest(email)}`, 2);
        const user = usersByEmail(email);
        if (user && (path.endsWith("forgot") || !user.emailVerified)) {
          const purpose = path.endsWith("forgot") ? "reset" : "verify";
          const token = makeToken(user, purpose);
          mail.enqueue({
            id: `${purpose}:${digest(token)}`,
            ownerId: user.id,
            kind: purpose,
            to: email,
            subject:
              purpose === "reset"
                ? "Redefinir senha da Nexora"
                : "Confirme seu e-mail na Nexora",
            message:
              purpose === "reset"
                ? "Você solicitou uma nova senha. Se não foi você, ignore este e-mail. Link válido por uma hora."
                : "Confirme seu e-mail. Link válido por uma hora.",
            link: `${config.origin}/${purpose === "reset" ? "redefinir-senha" : "verificar-email"}?token=${token}`,
          });
        }
        return {
          status: 200,
          data: {
            message:
              "Se a conta existir, você receberá um e-mail com os próximos passos.",
          },
        };
      }
      if (path === "/api/auth/verify" || path === "/api/auth/reset") {
        if (
          typeof input.token !== "string" ||
          !/^[a-f0-9]{64}$/.test(input.token)
        )
          failure(400, "Link inválido ou expirado.");
        const purpose = path.endsWith("verify") ? "verify" : "reset";
        const current = () => {
          const t = store.get("authTokens", digest(input.token));
          if (!t || t.purpose !== purpose || t.expires < Date.now())
            failure(400, "Link inválido ou expirado.");
          return t;
        };
        let token = current();
        let user = store.get("users", token.ownerId);
        if (!user) failure(400, "Link inválido.");
        let passwordFields = {};
        if (purpose === "reset") {
          const salt = randomBytes(16).toString("hex");
          passwordFields = {
            passwordSalt: salt,
            passwordHash: await passwordHash(
              passwordValue(input.password),
              salt,
            ),
          };
        }
        store.transaction(() => {
          token = current();
          user = store.get("users", token.ownerId);
          store.remove("authTokens", token.id);
          store.put("users", {
            ...user,
            ...passwordFields,
            emailVerified: purpose === "verify" ? true : user.emailVerified,
          });
          if (purpose === "reset")
            for (const s of store
              .all("sessions")
              .filter((s) => s.ownerId === user.id))
              store.remove("sessions", s.id);
          if (purpose === "verify")
            mail.enqueue({
              id: `welcome:${user.id}`,
              ownerId: user.id,
              kind: "welcome",
              to: user.email,
              subject: "Bem-vindo à Nexora",
              message: `Olá, ${user.name}. Seu e-mail foi confirmado. Entre na sua conta para escolher um plano. Suporte: ${config.supportEmail}.`,
              link: config.origin + "/login",
            });
        });
        return {
          status: 200,
          data: {
            message:
              purpose === "verify"
                ? "E-mail confirmado. Você já pode entrar."
                : "Senha atualizada. Entre novamente.",
          },
        };
      }
      failure(404, "Rota não encontrada.");
    },
  };
}
