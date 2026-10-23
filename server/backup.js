import { backup, DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
const magic = Buffer.from("NEXORA-BACKUP-v1\n");
export function encryptBackup(bytes, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const header = Buffer.from(
    JSON.stringify({
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }) + "\n",
  );
  return Buffer.concat([magic, header, encrypted]);
}
export function decryptBackup(bytes, key) {
  if (!bytes.subarray(0, magic.length).equals(magic))
    throw new Error("Formato de backup inválido.");
  const end = bytes.indexOf(10, magic.length);
  if (end < 0 || end > 1024) throw new Error("Cabeçalho inválido.");
  const header = JSON.parse(bytes.subarray(magic.length, end));
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(header.iv, "hex"),
  );
  cipher.setAuthTag(Buffer.from(header.tag, "hex"));
  const plain = Buffer.concat([
    cipher.update(bytes.subarray(end + 1)),
    cipher.final(),
  ]);
  if (createHash("sha256").update(plain).digest("hex") !== header.sha256)
    throw new Error("Checksum inválido.");
  return plain;
}
export function backupService({ store, config, s3 }) {
  const configured = Boolean(
    config.backupBucket && /^[a-f0-9]{64}$/i.test(config.backupKey),
  );
  const client =
    s3 ||
    (configured
      ? new S3Client({
          region: config.backupRegion,
          endpoint: config.backupEndpoint || undefined,
          forcePathStyle: Boolean(config.backupEndpoint),
          requestHandler: { connectionTimeout: 10000, requestTimeout: 30000 },
        })
      : null);
  let running = false;
  return {
    configured,
    healthy() {
      const b = store.get("system", "backup");
      return (
        b?.status === "ok" &&
        Date.now() - Date.parse(b.createdAt) < 26 * 3600000
      );
    },
    async run(force = false) {
      if (running || !configured) return;
      if (!force) {
        const last = store.get("system", "backup");
        if (
          last?.status === "ok" &&
          Date.now() - Date.parse(last.createdAt) < 24 * 3600000
        )
          return;
      }
      running = true;
      const directory = join(config.dataDir, "backup-work");
      const raw = join(directory, randomUUID() + ".sqlite");
      const checked = raw + ".verify";
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await backup(store.db, raw);
        const bytes = await readFile(raw);
        const encrypted = encryptBackup(bytes, config.backupKey);
        await writeFile(checked, decryptBackup(encrypted, config.backupKey), {
          mode: 0o600,
          flag: "wx",
        });
        const db = new DatabaseSync(checked, { readOnly: true });
        try {
          if (
            db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
          )
            throw new Error("Integrity check failed");
        } finally {
          db.close();
        }
        const date = new Date().toISOString();
        const objectKey = `${config.backupPrefix}/${date.slice(0, 10)}/${randomUUID()}.sqlite.enc`;
        const checksum = createHash("sha256").update(encrypted).digest("hex");
        await client.send(
          new PutObjectCommand({
            Bucket: config.backupBucket,
            Key: objectKey,
            Body: encrypted,
            ContentType: "application/octet-stream",
            Metadata: { sha256: checksum },
            ServerSideEncryption: "AES256",
          }),
        );
        const remote = await client.send(
          new HeadObjectCommand({
            Bucket: config.backupBucket,
            Key: objectKey,
          }),
        );
        if (
          remote.ContentLength !== encrypted.length ||
          remote.Metadata?.sha256 !== checksum
        )
          throw new Error("Remote backup verification failed");
        store.put("system", {
          id: "backup",
          status: "ok",
          createdAt: date,
          objectKey,
          encryptedBytes: encrypted.length,
          restoreVerified: true,
        });
      } catch {
        store.put("system", {
          id: "backup",
          status: "failed",
          createdAt: new Date().toISOString(),
          error:
            "Falha no backup externo criptografado; verifique credenciais, permissões e conectividade.",
        });
      } finally {
        await Promise.all([
          unlink(raw).catch(() => {}),
          unlink(checked).catch(() => {}),
        ]);
        running = false;
      }
    },
  };
}
