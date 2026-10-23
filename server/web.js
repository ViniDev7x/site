import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
export function errorHtml(status) {
  const missing = status === 404;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg"><title>${status} · Nexora</title><style>body{margin:0;background:#f7f6fb;color:#293247;font:16px system-ui;display:grid;place-items:center;min-height:100vh}main{max-width:540px;margin:24px;padding:50px;background:#fff;border:1px solid #e5dfef;border-radius:18px}strong{color:#8a70d7;font-size:54px}h1{font-size:27px}p{color:#8590a0;line-height:1.8}a{display:inline-block;padding:12px 18px;background:#8971dd;color:#fff;border-radius:7px;text-decoration:none}</style></head><body><main><strong>${status}</strong><h1>${missing ? "Este endereço não existe." : "Não conseguimos carregar esta página."}</h1><p>${missing ? "Confira o endereço ou volte para a página inicial." : "Tente novamente em alguns instantes. Se o problema continuar, use o contato de suporte disponível na página inicial."}</p><a href="/">Voltar para o início</a></main></body></html>`;
}
export function securityHeaders(res, production) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (production) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com",
    );
  }
}
const routes = new Set([
  "/",
  "/login",
  "/cadastro",
  "/verificar-email",
  "/redefinir-senha",
  "/termos",
  "/privacidade",
  "/reembolsos",
  "/status",
]);
export async function serveWeb(req, res, root) {
  const path = new URL(req.url, "http://localhost").pathname;
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, {
      "Content-Type": "text/html; charset=utf-8",
      Allow: "GET, HEAD",
    });
    return res.end(errorHtml(404));
  }
  let file;
  try {
    const decoded = decodeURIComponent(path);
    if (
      decoded.includes("\0") ||
      decoded.split("/").some((p) => p.startsWith("."))
    )
      throw Error();
    file = resolve(root, "." + decoded);
    if (!file.startsWith(resolve(root) + sep) && file !== resolve(root))
      throw Error();
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(errorHtml(404));
  }
  const spa = routes.has(path);
  if (spa) file = resolve(root, "index.html");
  try {
    const info = await stat(file);
    if (!info.isFile()) throw Error();
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
      ".txt": "text/plain; charset=utf-8",
    }[extname(file)];
    if (!mime) throw Error();
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": spa
        ? "no-store"
        : path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
    });
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    const status = spa ? 500 : 404;
    res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(errorHtml(status));
  }
}
