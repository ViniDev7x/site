import React, { useEffect, useState } from "react";
import { PLANS, planSpecs, FREE_RENEWAL_DAYS } from "../shared/plans.js";
import { quote, brl } from "../shared/pricing.js";
import { api, post } from "./api.js";
export function PlanCards({
  selected,
  onSelect,
  category = "Jogos",
  region = "São Paulo, BR",
  hideFree = false,
}) {
  return (
    <div className="plan-cards">
      {Object.entries(PLANS)
        .filter(([id]) => !hideFree || id !== "free")
        .map(([id, p]) => (
          <button
            type="button"
            key={id}
            aria-pressed={selected === id}
            className={"plan-card " + (selected === id ? "chosen" : "")}
            onClick={() => onSelect(id)}
          >
            <strong>{p.label}</strong>
            <b>
              {p.ram}
              {id === "elite" ? "+" : ""} GB RAM
            </b>
            <span>
              {p.cpu} vCPU · {p.disk} GB disco
            </span>
            <span>
              {category === "Jogos"
                ? `Até ${p.slots} jogadores`
                : "Jogos, bots e sites"}
            </span>
            <b>
              {brl(quote({ ...planSpecs(id), category, region }).monthly)}/mês
            </b>
            <small>
              {id === "free"
                ? "Sem cartão · backup manual"
                : id === "elite"
                  ? "Personalize até 64 GB"
                  : "Backup automático e domínio próprio"}
            </small>
          </button>
        ))}
    </div>
  );
}
const emptyCoupon = () => ({
  code: "",
  type: "percent",
  value: 10,
  plans: ["starter", "plus", "pro", "elite"],
  maxUses: 100,
  oncePerAccount: true,
  active: true,
  expiresAt: "",
  startsAt: "",
  attribution: "",
});
export function CouponsAdmin() {
  const [report, setReport] = useState({ coupons: [], uses: [] }),
    [form, setForm] = useState(emptyCoupon),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = () => api("/admin/coupons").then(setReport);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const change = (key, value) => setForm((v) => ({ ...v, [key]: value }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        value:
          form.type === "fixed"
            ? Math.round(Number(form.value) * 100)
            : Number(form.value),
        maxUses: Number(form.maxUses),
        expiresAt: new Date(form.expiresAt).toISOString(),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      };
      await api(editing ? `/admin/coupons/${editing}` : "/admin/coupons", {
        method: editing ? "PATCH" : "POST",
        body: payload,
      });
      setEditing(null);
      setForm(emptyCoupon());
      setMessage("Cupom salvo. Reservas existentes mantêm o preço acordado.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const dateInput = (s) =>
    s
      ? new Date(
          new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <section className="panel">
      <h2>Cupons de desconto</h2>
      <p>
        Desconto após o desconto do ciclo, válido também nas renovações da
        assinatura. Limite conta reservas e resgates. O plano pago mantém
        cobrança mínima de R$ 1,00.
      </p>
      <form className="coupon-form" onSubmit={save}>
        <label>
          Código do cupom
          <input
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_-]{3,32}"
            value={form.code}
            onChange={(e) => change("code", e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Tipo de desconto
          <select
            value={form.type}
            onChange={(e) => change("type", e.target.value)}
          >
            <option value="percent">Percentual (%)</option>
            <option value="fixed">Valor fixo (R$ por ciclo)</option>
          </select>
        </label>
        <label>
          Valor do desconto
          <input
            type="number"
            required
            min={form.type === "fixed" ? 0.01 : 1}
            max={form.type === "percent" ? 99 : 100000}
            step={form.type === "fixed" ? 0.01 : 1}
            value={form.value}
            onChange={(e) => change("value", e.target.value)}
          />
        </label>
        <label>
          Início (opcional)
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => change("startsAt", e.target.value)}
          />
        </label>
        <label>
          Validade do cupom
          <input
            required
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => change("expiresAt", e.target.value)}
          />
        </label>
        <label>
          Limite total de usos
          <input
            required
            type="number"
            min="1"
            max="1000000"
            value={form.maxUses}
            onChange={(e) => change("maxUses", e.target.value)}
          />
        </label>
        <label>
          Referência de indicação (opcional)
          <input
            maxLength={80}
            value={form.attribution}
            onChange={(e) => change("attribution", e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Planos permitidos</legend>
          {Object.entries(PLANS)
            .filter(([id]) => id !== "free")
            .map(([id, p]) => (
              <label className="policy-check" key={id}>
                <input
                  type="checkbox"
                  checked={form.plans.includes(id)}
                  onChange={(e) =>
                    change(
                      "plans",
                      e.target.checked
                        ? [...form.plans, id]
                        : form.plans.filter((p) => p !== id),
                    )
                  }
                />
                {p.label}
              </label>
            ))}
        </fieldset>
        <label className="policy-check">
          <input
            type="checkbox"
            checked={form.oncePerAccount}
            onChange={(e) => change("oncePerAccount", e.target.checked)}
          />
          Uma utilização por conta
        </label>
        <label className="policy-check">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => change("active", e.target.checked)}
          />
          Cupom ativo
        </label>
        <button className="primary" disabled={busy}>
          {editing ? "Salvar alterações" : "Criar cupom"}
        </button>
        {editing && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEditing(null);
              setForm(emptyCoupon());
            }}
          >
            Cancelar edição
          </button>
        )}
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Desconto</th>
              <th>Resgates / reservas</th>
              <th>Limite</th>
              <th>Estado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {report.coupons.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{c.type === "percent" ? `${c.value}%` : brl(c.value)}</td>
                <td>
                  {c.redeemed} / {c.reserved}
                </td>
                <td>{c.maxUses}</td>
                <td>
                  {!c.active
                    ? "Desativado"
                    : Date.parse(c.expiresAt) <= Date.now()
                      ? "Expirado"
                      : "Ativo"}
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setEditing(c.id);
                      setForm({
                        ...c,
                        value: c.type === "fixed" ? c.value / 100 : c.value,
                        startsAt: dateInput(c.startsAt),
                        expiresAt: dateInput(c.expiresAt),
                      });
                    }}
                  >
                    Editar {c.code}
                  </button>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await api(`/admin/coupons/${c.id}`, {
                          method: "PATCH",
                          body: { active: !c.active },
                        });
                        await load();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    {c.active ? "Desativar" : "Ativar"} {c.code}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Uso por conta</h3>
      {report.uses.length ? (
        report.uses.map((u) => (
          <p key={u.id}>
            {u.code} · conta {u.ownerId} · {u.status} · {brl(u.discount)} ·{" "}
            {u.attribution || "Sem indicação"} · pedido {u.orderId}
          </p>
        ))
      ) : (
        <p>Nenhum uso registrado.</p>
      )}
    </section>
  );
}
export function ServicePlanControls({ service, onChange, onUpgrade }) {
  const [settings, setSettings] = useState(
      service.settings || {
        customDomain: "",
        backupSchedule: "manual",
        slots: service.entitlements?.maxSlots || 0,
      },
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(
    () =>
      setSettings(
        service.settings || {
          customDomain: "",
          backupSchedule: "manual",
          slots: service.entitlements?.maxSlots || 0,
        },
      ),
    [service.id, service.quote.specs.plan],
  );
  const free = service.quote.specs.plan === "free";
  async function run(fn) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Plano {PLANS[service.quote.specs.plan]?.label || "Personalizado"}</h2>
      {free && (
        <>
          <p>
            Sem cartão. {FREE_RENEWAL_DAYS} dias por renovação manual, apenas
            subdomínio da plataforma, backup manual e até 5 jogadores. Sem
            renovação, o serviço é pausado e os dados são preservados.
          </p>
          <p>
            Renovar até:{" "}
            {service.freeTier?.renewBy
              ? new Date(service.freeTier.renewBy).toLocaleString("pt-BR")
              : "Aguardando confirmação"}
          </p>
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  onChange(
                    await post(`/services/${service.id}/renew-free`, {}),
                  );
                  setNotice(
                    "Free renovado. Se estava pausado, você já pode iniciar o serviço.",
                  );
                })
              }
            >
              Renovar Free por 7 dias
            </button>
            <button
              className="primary"
              disabled={!!service.pendingUpgradeOrderId || busy}
              onClick={onUpgrade}
            >
              Fazer upgrade
            </button>
          </div>
        </>
      )}
      {service.pendingUpgradeOrderId && (
        <p className="warning">
          Upgrade pendente de pagamento ou confirmação. Acompanhe em seus
          pedidos. O plano atual continua até a aplicação do upgrade.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            onChange(
              await api(`/services/${service.id}/settings`, {
                method: "PATCH",
                body: settings,
              }),
            );
            setNotice("Configurações aplicadas.");
          });
        }}
      >
        <label>
          Domínio customizado
          <input
            disabled={free || busy}
            value={settings.customDomain || ""}
            onChange={(e) =>
              setSettings({ ...settings, customDomain: e.target.value })
            }
            placeholder={free ? "Disponível nos planos pagos" : "seusite.com"}
          />
        </label>
        <label>
          Agendamento de backup
          <select
            aria-label="Agendamento de backup"
            disabled={free || busy}
            value={settings.backupSchedule}
            onChange={(e) =>
              setSettings({ ...settings, backupSchedule: e.target.value })
            }
          >
            <option value="manual">Somente manual</option>
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
          </select>
        </label>
        {service.category === "Jogos" && (
          <label>
            Slots de jogadores
            <input
              type="number"
              min="1"
              max={service.entitlements?.maxSlots || 5}
              value={settings.slots}
              onChange={(e) =>
                setSettings({ ...settings, slots: Number(e.target.value) })
              }
            />
          </label>
        )}
        <button
          className="secondary"
          disabled={busy || !!service.pendingUpgradeOrderId}
        >
          Salvar configurações
        </button>
      </form>
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const r = await post(`/services/${service.id}/backups`, {});
            setNotice(
              r.demo
                ? r.message
                : "Solicitação de backup manual enviada à infraestrutura.",
            );
          })
        }
      >
        Criar backup manual
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

export function PendingOrders() {
  const [orders, setOrders] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      api("/pending-orders")
        .then((v) => active && setOrders(v))
        .catch((e) => active && setError(e.message));
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!orders.length)
    return error ? <p className="form-error">{error}</p> : null;
  return (
    <section className="panel">
      <h2>Pagamentos pendentes</h2>
      {orders.map((o) => (
        <div className="file-row" key={o.id}>
          <span>
            {o.kind === "upgrade" ? "Upgrade" : "Criação"} · {o.name} ·{" "}
            {brl(o.quote.total)}
          </span>
          <button
            className="secondary"
            onClick={async () => {
              try {
                const r = await post(`/orders/${o.id}/resume-checkout`, {});
                sessionStorage.setItem("nexora-last-order", o.id);
                window.location.assign(r.url);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Retomar pagamento
          </button>
        </div>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
