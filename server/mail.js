import { Resend } from "resend";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mailService({ store, config, client }) {
  const key = config.appKey
    ? Buffer.from(config.appKey, "hex")
    : randomBytes(32);
  const resend =
    client || (config.resendKey ? new Resend(config.resendKey) : null);
  let working = false;let stopping=false;
  function encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
  }
  function decrypt(value) {
    const cipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(value.iv, "base64"),
    );
    cipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(value.data, "base64")),
        cipher.final(),
      ]).toString("utf8"),
    );
  }
  const configured = Boolean(resend && config.mailFrom && config.resendWebhook);
  return {
    configured,stop(){stopping=true;},
    enqueue({ id, ownerId, kind, to, subject, message, link }) {
      if (!to || store.get("mailOutbox", id)) return;
      const payload = {
        to,
        subject,
        text: message + (link ? "\n\n" + link : ""),
        html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#263247"><h1 style="font-size:22px">${escape(subject)}</h1><p style="white-space:pre-line;line-height:1.8">${escape(message)}</p>${link ? `<p><a href="${escape(link)}">Continuar na Nexora</a></p>` : ""}<p style="font-size:12px">${escape(config.operator || "Nexora")} · Suporte: ${escape(config.supportEmail)}</p></body></html>`,
      };
      store.put("mailOutbox", {
        id,
        ownerId,
        kind,
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
        payload: encrypt(payload),
      });
    },
    async probe() {
      if (!configured) return false;
      const senderDomain=(config.mailFrom.match(/<([^>]+)>/)?.[1]||config.mailFrom).split('@')[1]?.toLowerCase();
      if(config.production&&(!senderDomain||senderDomain==='resend.dev'))return false;
      const owner = store
        .all("users")
        .find((u) => u.email === config.launchTestEmail);
      if (
        owner &&
        store.get("mailOutbox", `welcome:${owner.id}`)?.status === "delivered"
      )
        return true;
      const domain = (
        config.mailFrom.match(/<([^>]+)>/)?.[1] || config.mailFrom
      ).split("@")[1];
      try {
        const r = await resend.domains.list({}, {signal:AbortSignal.timeout(15000)});
        return (
          !r.error &&
          r.data?.data?.some(
            (d) => d.name === domain && d.status === "verified",
          ) === true
        );
      } catch {
        return false;
      }
    },
    async flush() {
      if (stopping || working || !configured) return;
      working = true;
      try {
        for (const item of store
          .all("mailOutbox")
          .filter(
            (m) =>
              ["pending", "retry", "sending"].includes(m.status) &&
              (!m.nextAttempt || m.nextAttempt < Date.now()),
          ).slice(0,3)) {
          if(stopping)break;
          if (
            item.attempts >= 6 ||
            Date.now() - new Date(item.createdAt).getTime() > 23 * 3600000
          ) {
            store.put("mailOutbox", {
              ...item,
              status: "review",
              error: "Entrega não confirmada; revisão manual necessária.",
            });
            continue;
          }
          const attempt = {
            ...item,
            status: "sending",
            attempts: item.attempts + 1,
            nextAttempt:
              Date.now() + Math.min(3600000, 30000 * 2 ** item.attempts),
          };
          store.put("mailOutbox", attempt);
          try {
            const payload = decrypt(item.payload);
            const result = await resend.emails.send(
              { from: config.mailFrom, ...payload },
              {
                idempotencyKey: createHash("sha256")
                  .update(item.id)
                  .digest("hex"),signal:AbortSignal.timeout(15000),
              },
            );
            if (result.error || !result.data?.id)
              throw new Error("Provider rejected mail");
            const receipt=store.all('mailReceipts').filter(r=>r.providerId===result.data.id).sort((a,b)=>b.eventAt.localeCompare(a.eventAt))[0];
            store.put("mailOutbox", {
              ...attempt,
              status: receipt?.status || "accepted",eventAt:receipt?.eventAt,
              providerId: result.data.id,
              acceptedAt: new Date().toISOString(),
              error: null,
            });
          } catch {
            store.put("mailOutbox", {
              ...attempt,
              status: "retry",
              error:
                "Falha no provedor de e-mail. A nova tentativa está agendada.",
            });
          }
        }
      } finally {
        working = false;
      }
    },
    async webhook(raw, headers) {
      if (!configured)
        throw Object.assign(new Error("E-mail não configurado."), {
          status: 503,
        });
      let event;
      try {
        event = resend.webhooks.verify({
          payload: raw.toString("utf8"),
          headers: {
            id: headers["svix-id"],
            timestamp: headers["svix-timestamp"],
            signature: headers["svix-signature"],
          },
          webhookSecret: config.resendWebhook,
        });
      } catch {
        throw Object.assign(new Error("Assinatura do e-mail inválida."), {
          status: 400,
        });
      }
      const eventId = `mail:${headers["svix-id"]}`;
      if (store.get("events", eventId))
        return { received: true, duplicate: true };
      store.transaction(() => {
        const item = store
          .all("mailOutbox")
          .find((m) => m.providerId === event.data?.email_id);
        const statuses = {
          "email.delivered": "delivered",
          "email.bounced": "bounced",
          "email.failed": "failed",
          "email.complained": "complained",
        };
        const eventAt=Number.isFinite(Date.parse(event.created_at))?new Date(event.created_at).toISOString():new Date().toISOString();
        if(statuses[event.type]&&event.data?.email_id)store.put('mailReceipts',{id:eventId,providerId:event.data.email_id,status:statuses[event.type],eventAt});
        if (item && statuses[event.type] && (!item.eventAt||item.eventAt<=eventAt))
          store.put("mailOutbox", {
            ...item,
            status: statuses[event.type],
            eventAt,
          });
        store.put("events", {
          id: eventId,
          type: event.type,
          createdAt: new Date().toISOString(),
        });
      });
      return { received: true };
    },
  };
}
