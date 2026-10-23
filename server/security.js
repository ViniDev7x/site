import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
export class Limiter {
  constructor() {
    this.windows = new Map();
  }
  allow(key, limit, now = Date.now()) {
    if (this.windows.size > 10000)
      for (const [k, value] of this.windows)
        if (value.until <= now) this.windows.delete(k);
    let value = this.windows.get(key);
    if (!value || value.until <= now) {
      value = { count: 0, until: now + 60000 };
      this.windows.set(key, value);
    }
    return ++value.count <= limit;
  }
}
export const POLICY = {
  version: "2026-10-v1",
  prohibited: [
    "Spam e envio de e-mails não solicitados",
    "Scraping que viole limites ou autorização",
    "Ataques a terceiros, fraude e distribuição de malware",
  ],
  suspension:
    "Malware confirmado ou evidência de abuso suspende o serviço, bloqueia reinicialização e gera notificação. Conteste pelo suporte; reativação exige revisão administrativa.",
  thresholds: { connectionsPerMinute: 5000, smtpAttempts: 10, abuseReports: 3 },
  isolation:
    "Perfil Docker planejado: usuário sem root, namespaces por serviço, limites cgroups, sem privilégios e sem socket Docker; alto risco exige VM dedicada. O worker atual apenas simula provisionamento.",
  upload:
    "Uploads entram em quarentena. ClamAV deve retornar código 0 antes de o artefato ser vinculado ao provisionamento; scanner ausente, timeout e erros bloqueiam a liberação.",
};
export function isolationProfile(specs, id) {
  return {
    runtime:
      specs.ram > 8 || specs.cpu > 4 || specs.disk > 100
        ? "vm-required"
        : "docker",
    name: `tenant-${id}`,
    user: "10001:10001",
    privileged: false,
    readOnlyRootfs: true,
    capDrop: ["ALL"],
    securityOpt: ["no-new-privileges:true"],
    network: `isolated-${id}`,
    memoryBytes: specs.ram * 1024 ** 3,
    nanoCpus: specs.cpu * 1e9,
    diskGB: specs.disk,
    pidsLimit: 128,
    published: false,
  };
}
export async function scanUpload({
  dataDir,
  filename,
  content,
  scanner = "clamscan",
}) {
  if (
    typeof filename !== "string" ||
    !/\.(zip|js|py|html|css|json|txt)$/i.test(filename) ||
    filename.length > 120
  )
    throw new Error(
      "Use ZIP, JS, Python, HTML, CSS, JSON ou TXT (até 512 KB).",
    );
  if (
    typeof content !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      content,
    )
  )
    throw new Error("Conteúdo base64 inválido.");
  const bytes = Buffer.from(content, "base64");
  if (!bytes.length || bytes.length > 512 * 1024)
    throw new Error("Tamanho inválido: máximo de 512 KB nesta versão.");
  const directory = join(dataDir, "quarantine");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const path = join(directory, id);
  await writeFile(path, bytes, { mode: 0o600 });
  const result = await new Promise((resolve) => {
    const child = spawn(
      scanner,
      [
        "--no-summary",
        "--infected",
        "--scan-archive=yes",
        "--alert-encrypted=yes",
        "--alert-exceeds-max=yes",
        "--max-filesize=1M",
        "--max-scansize=10M",
        "--max-recursion=10",
        "--",
        path,
      ],
      {
        stdio: "ignore",
      },
    );
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(status);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish("scanner-timeout");
    }, 30000);
    child.on("error", () => finish("scanner-unavailable"));
    child.on("exit", (code) =>
      finish(code === 0 ? "clean" : code === 1 ? "infected" : "scanner-error"),
    );
  });
  if (result !== "clean") await unlink(path).catch(() => {});
  return {
    id,
    filename,
    bytes: bytes.length,
    status: result,
    scannedAt: new Date().toISOString(),
  };
}
