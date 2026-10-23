import React, { useEffect, useState } from "react";
import {
  Gift,
  Copy,
  ArrowUpRight,
  ShieldCheck,
  ShoppingBag,
  Server,
  Wallet,
  Users,
  RefreshCw,
} from "lucide-react";
import { api, post } from "./api.js";
import { TABLE, brl } from "../shared/pricing.js";
function ErrorMessage({ message }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
function Metric({ title, value, help }) {
  return (
    <section className="stat">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
      <p className="muted">{help}</p>
    </section>
  );
}
export function AffiliatePanel({ notify, onBrand, onConfigure }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "Minha comunidade",
    color: "#8971dd",
    logo: "",
    domain: "",
    plan: "personal",
    margin: 15,
  });
  async function load() {
    const v = await api("/affiliate");
    setData(v);
    if (v.affiliate) {
      const a = v.affiliate;
      setForm({
        name: a.brand.name,
        color: a.brand.color,
        logo: a.brand.logo,
        domain: a.domain,
        plan: a.plan,
        margin: a.margin,
      });
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const change = (key, value) => setForm({ ...form, [key]: value });
  async function action(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const a = data?.affiliate;
  const commissions = data?.commissions || [];
  const total = (status) =>
    commissions
      .filter((c) => status.includes(c.status))
      .reduce((n, c) => n + c.cents, 0);
  const link = a ? `${location.origin}/?ref=${a.code}` : "";
  return (
    <>
      <div className="growth-intro">
        <div className="intro-icon">
          <Gift size={25} />
        </div>
        <div>
          <h2>Sua comunidade. Sua marca. Sua receita.</h2>
          <p>
            15% de comissão recorrente por indicação ou sua margem de revenda
            entre 0% e 40%. Sem autoindicação.
          </p>
        </div>
      </div>
      <div className="stats growth-stats">
        <Metric
          title="Clientes indicados com pagamento"
          value={data?.referredCustomers || 0}
          help="Atribuição pelo link único"
        />
        <Metric
          title="Comissões pendentes"
          value={brl(total(["pending"]))}
          help="Pagamentos Stripe test mode conciliados"
        />
        <Metric
          title="Transferido ao Connect"
          value={brl(total(["transferred"]))}
          help="Transferência confirmada pelo Stripe"
        />
        <Metric
          title="Ganhos de demonstração"
          value={brl(total(["demo"]))}
          help="Simulações não podem ser sacadas"
        />
      </div>
      <div className="growth-columns">
        <section className="panel">
          <div className="panel-title">
            <h3>Seu link de indicação</h3>
            <span className="tag">Recorrente · 15%</span>
          </div>
          {a ? (
            <>
              <div className="console-input">
                <input aria-label="Link de indicação" readOnly value={link} />
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      notify("Link copiado.");
                    } catch {
                      notify("Copie o link exibido no campo.");
                    }
                  }}
                >
                  <Copy size={16} />
                </button>
              </div>
              <p className="muted">
                Comissão sobre o valor recorrente pago, após desconto, sem a
                licença do marketplace. Na revenda, o ganho é a margem
                descontada no ciclo, em vez dos 15%.
              </p>
            </>
          ) : (
            <p>Salve sua marca para gerar seu link único.</p>
          )}
          <div className="connect-box">
            <Wallet size={23} />
            <div>
              <b>Stripe Connect</b>
              <p>
                Status: {a?.connectStatus || "não conectado"}. Fechamento mensal
                das comissões anteriores ao mês atual, em UTC.
              </p>
            </div>
          </div>
          <button
            className="primary"
            disabled={!a || busy || !data?.stripeConfigured}
            onClick={() =>
              action(async () => {
                const r = await post("/affiliate/connect");
                location.assign(r.url);
              })
            }
          >
            Conectar conta de teste <ArrowUpRight size={15} />
          </button>
          {!data?.stripeConfigured && (
            <p className="muted">
              Configure Stripe test mode no servidor para habilitar. Nenhum
              repasse real é realizado.
            </p>
          )}
        </section>
        <section
          className="panel brand-preview"
          style={{ "--preview-color": form.color }}
        >
          <div className="preview-browser">
            ● ● ● <span>{form.domain || "hospedagem.suacomunidade.com"}</span>
          </div>
          <div className="preview-content">
            {form.logo ? (
              <img
                src={form.logo}
                referrerPolicy="no-referrer"
                alt="Logo da sua marca"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <Server size={31} />
            )}
            <h2>{form.name}</h2>
            <p>Infraestrutura para a sua comunidade.</p>
            <button onClick={() => onConfigure({ category: "Jogos" })}>
              Conhecer planos <ArrowUpRight size={14} />
            </button>
          </div>
          <small>
            Prévia da marca · domínio exige DNS, TLS e proxy configurados.
          </small>
        </section>
      </div>
      <form
        className="panel settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          action(async () => {
            const value = await api("/affiliate", {
              method: "PUT",
              body: form,
            });
            await load();
            onBrand(value.brand);
            notify("Marca e preferências de revenda salvas.");
          });
        }}
      >
        <div className="panel-title">
          <h3>White label & revenda</h3>
          <span className="tag">Margem permitida: 0–40%</span>
        </div>
        <div className="form-grid">
          <label>
            Nome da marca
            <input
              required
              minLength={2}
              maxLength={45}
              value={form.name}
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <label>
            Cor principal
            <div className="color-field">
              <input
                aria-label="Cor principal"
                type="color"
                value={form.color}
                onChange={(e) => change("color", e.target.value)}
              />
              <span>{form.color}</span>
            </div>
          </label>
          <label>
            Logo (URL HTTPS)
            <input
              type="url"
              value={form.logo}
              placeholder="https://sua-marca.com/logo.png"
              onChange={(e) => change("logo", e.target.value)}
            />
          </label>
          <label>
            Subdomínio customizado
            <input
              placeholder="hospedagem.clasny.com"
              value={form.domain}
              onChange={(e) => change("domain", e.target.value)}
            />
          </label>
          <label>
            Nível de gestão
            <select
              value={form.plan}
              onChange={(e) => change("plan", e.target.value)}
            >
              {Object.entries(TABLE.agency).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label} · {brl(p.cents)}/mês
                </option>
              ))}
            </select>
          </label>
          <label>
            Margem de revenda ({form.margin}%)
            <input
              aria-label="Margem de revenda"
              type="range"
              min="0"
              max="40"
              value={form.margin}
              onChange={(e) => change("margin", Number(e.target.value))}
            />
          </label>
        </div>
        <p className="muted">
          O plano de agência/revenda é contratado no wizard. Salvar esta
          preferência não realiza cobrança. Margem só é aplicada após
          contratação de Revenda.
        </p>
        <div className="actions">
          <button className="primary" disabled={busy}>
            Salvar marca e revenda
          </button>
          {form.plan !== "personal" && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onConfigure({ category: "Jogos", agency: form.plan })
              }
            >
              Contratar {TABLE.agency[form.plan].label}
            </button>
          )}
        </div>
      </form>
      {a?.domain && (
        <section className="panel">
          <h3>Verificação do domínio · {a.domainStatus}</h3>
          <p>Adicione um registro TXT no DNS:</p>
          <code className="dns-code">
            _nexora.{a.domain} → {a.dnsToken}
          </code>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await post("/affiliate/domain/verify");
                await load();
                notify(
                  "Posse do domínio verificada. Configure DNS de destino, proxy e TLS para publicar.",
                );
              })
            }
          >
            Verificar TXT
          </button>
          <p className="muted">
            A verificação comprova a posse. DNS de destino, proxy reverso e
            certificado TLS precisam ser configurados antes de usar o domínio.
          </p>
        </section>
      )}
      <section className="panel">
        <h3>Histórico de comissões e repasses</h3>
        {commissions.length ? (
          commissions.map((c) => (
            <div className="file-row" key={c.id}>
              <Wallet size={17} />
              <b>{new Date(c.createdAt).toLocaleDateString("pt-BR")}</b>
              <span>{c.mode === "margin" ? "Margem" : "Indicação"}</span>
              <strong>{brl(c.cents)}</strong>
              <span className="tag">{c.status}</span>
            </div>
          ))
        ) : (
          <p className="empty">
            As comissões aparecem após pagamentos de clientes indicados.
            Simulações ficam separadas dos valores transferíveis.
          </p>
        )}
        {data?.payouts.map((p) => (
          <div className="file-row" key={p.id}>
            <b>Fechamento {p.period}</b>
            <span>{p.status}</span>
            <strong>{brl(p.cents)}</strong>
          </div>
        ))}
      </section>
      <ErrorMessage message={error} />
    </>
  );
}
export function Marketplace({ onConfigure }) {
  const [licenses, setLicenses] = useState([]);
  useEffect(() => {
    api("/licenses")
      .then(setLicenses)
      .catch((e) => setError(e.message));
  }, []);
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/catalog")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="growth-intro">
        <div className="intro-icon">
          <ShoppingBag size={25} />
        </div>
        <div>
          <h2>Menos configuração. Mais possibilidades.</h2>
          <p>
            Templates, complementos e planos para levar seu projeto mais longe.
          </p>
        </div>
        <span className="tag">Catálogo demonstrativo</span>
      </div>
      {licenses.length > 0 && (
        <section className="panel">
          <h3>Minhas licenças</h3>
          {licenses.map((l) => (
            <div className="file-row" key={l.id}>
              <b>{l.product.title}</b>
              <span>{l.demo ? "Demonstração" : "Stripe test mode"}</span>
              <a
                className="secondary"
                href={`/api/licenses/${l.id}/download`}
                download
              >
                Baixar ZIP
              </a>
            </div>
          ))}
        </section>
      )}
      <div className="docs-grid marketplace-grid">
        {data?.products.map((p) => (
          <section className="panel marketplace-card" key={p.id}>
            <span className="market-icon">{p.icon}</span>
            <span className="tag">{p.category}</span>
            <h2>{p.title}</h2>
            <small>por {p.seller}</small>
            <p>{p.description}</p>
            <div className="market-price">
              {brl(p.cents)}
              <small>licença única</small>
            </div>
            <button
              className="primary"
              onClick={() =>
                onConfigure({ category: p.category, template: p.id })
              }
            >
              Usar no novo serviço <ArrowUpRight size={14} />
            </button>
            <p className="muted">
              Repasse ao criador: 80% · Plataforma: 20%. ZIP disponível após a
              compra de demonstração. Instalação e repasses ao vendedor não são
              automáticos.
            </p>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-title">
          <h3>Complemente seu próximo serviço</h3>
          <span className="tag">Recorrência mensal</span>
        </div>
        <div className="addon-store">
          {Object.entries(TABLE.addons).map(([k, a]) => (
            <div className="addon-store-item" key={k}>
              <ShieldCheck size={20} />
              <div>
                <b>{a.label}</b>
                <p>
                  {brl(a.cents)}/mês · {a.categories.join(" / ")}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() =>
                  onConfigure({ category: a.categories[0], addons: { [k]: 1 } })
                }
              >
                Configurar
              </button>
            </div>
          ))}
        </div>
        <p className="muted">
          Selecione no wizard ou abra um serviço → Configurações → Contratar
          adicionais. Toda alteração exige cotação e confirmação explícita.
        </p>
      </section>
      <div className="docs-grid">
        {["agency", "reseller"].map((k) => (
          <section className="panel" key={k}>
            <Users size={28} />
            <h2>{TABLE.agency[k].label}</h2>
            <p>
              {k === "agency"
                ? "Centralize a gestão de projetos de clientes."
                : "Use sua marca e defina uma margem de 0% a 40%."}
            </p>
            <div className="market-price">
              {brl(TABLE.agency[k].cents)}
              <small>/mês + recursos</small>
            </div>
            <button
              className="primary"
              onClick={() => onConfigure({ category: "Jogos", agency: k })}
            >
              Configurar plano
            </button>
          </section>
        ))}
      </div>
      <ErrorMessage message={error} />
    </>
  );
}
export function BillingPanel() {
  const [invoices, setInvoices] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/invoices")
      .then(setInvoices)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel">
      <h3>Faturas registradas pelo servidor</h3>
      <p>
        O total do ciclo, o desconto e a licença única são calculados e
        congelados no pedido. As simulações não representam pagamentos reais.
      </p>
      {invoices.length ? (
        invoices.map((i) => (
          <div className="file-row" key={i.id}>
            <Wallet size={18} />
            <b>{new Date(i.date).toLocaleString("pt-BR")}</b>
            <span>{i.demo ? "Simulação" : "Stripe test mode"}</span>
            <strong>{brl(i.total)}</strong>
            <span className="tag">{i.status}</span>
          </div>
        ))
      ) : (
        <p className="empty">
          Nenhuma fatura criada. Crie um serviço para testar o fluxo.
        </p>
      )}
      <ErrorMessage message={error} />
    </section>
  );
}
export function SecurityPanel() {
  const [policy, setPolicy] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/policy")
      .then(setPolicy)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel">
      <h3>Segurança e política de uso</h3>
      <p className="warning">
        Provisionamento demonstrativo: nenhum isolamento de containers ou
        monitoramento de rede real é executado.
      </p>
      {policy && (
        <>
          <h3>Uso proibido</h3>
          <ul>
            {policy.prohibited.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <h3>Suspensão e revisão</h3>
          <p>{policy.suspension}</p>
          <h3>Uploads</h3>
          <p>{policy.upload}</p>
          <h3>Isolamento planejado</h3>
          <p>{policy.isolation}</p>
          <h3>Verificação de recursos</h3>
          <p>
            Mais de 8 GB RAM, 4 vCPU ou 100 GB de disco exigem revisão de
            identidade e pagamento. O cliente não pode aprovar a própria
            verificação.
          </p>
        </>
      )}
      <ErrorMessage message={error} />
    </section>
  );
}
export function AdminPanel({ notify }) {
  const [data, setData] = useState(null),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [verification, setVerification] = useState({
      userId: "",
      reference: "",
      identityVerified: false,
      paymentVerified: false,
    }),
    [traffic, setTraffic] = useState({
      serviceId: "",
      connectionsPerMinute: 0,
      smtpAttempts: 0,
      abuseReports: 0,
    }),
    [review, setReview] = useState("");
  async function load() {
    const d = await api("/admin/overview");
    setData(d);
    setVerification((v) => ({
      ...v,
      userId: v.userId || d.users[0]?.id || "",
    }));
    setTraffic((v) => ({
      ...v,
      serviceId: v.serviceId || d.services[0]?.id || "",
    }));
  }
  useEffect(() => {
    load().catch((e) => {
      if (!e.message.includes("administrativo")) setError(e.message);
    });
  }, []);
  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="panel admin-login">
        <ShieldCheck size={35} />
        <h2>Área administrativa protegida</h2>
        <p>
          Informe o token do servidor. No desenvolvimento ele é gerado em{" "}
          <code>.local/admin-token</code>. Não o compartilhe nem versione.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post("/admin/session", { token });
              setToken("");
            });
          }}
        >
          <label>
            Token administrativo
            <input
              type="password"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button className="primary" disabled={busy}>
            Entrar na administração
          </button>
        </form>
        <ErrorMessage message={error} />
      </section>
    );
  return (
    <>
      <div className="panel-title">
        <h2>Operação & confiança</h2>
        <button className="secondary" onClick={() => run(async () => {})}>
          <RefreshCw size={15} />
          Atualizar
        </button>
      </div>
      <div className="stats growth-stats">
        <Metric
          title="Contas"
          value={data.users.length}
          help="Sessões de demonstração isoladas"
        />
        <Metric
          title="Serviços"
          value={data.services.length}
          help="Recursos simulados"
        />
        <Metric
          title="Incidentes abertos"
          value={data.incidents.filter((i) => i.status === "open").length}
          help="Prioridade alta primeiro"
        />
        <Metric
          title="Receita marketplace"
          value={brl(data.sales.reduce((n, s) => n + s.platformCents, 0))}
          help="Participação de 20% · inclui simulações"
        />
      </div>
      <section className="panel">
        <h3>Estado das integrações</h3>
        {Object.entries(data.integrations).map(([key, value]) => (
          <div className="file-row" key={key}>
            <b>{key}</b>
            <span>{value}</span>
          </div>
        ))}
      </section>
      <div className="growth-columns">
        <form
          className="panel settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post("/admin/verify", verification);
              notify("Revisão registrada com trilha de auditoria.");
            });
          }}
        >
          <h3>Verificação manual de identidade e pagamento</h3>
          <p>
            Somente aprove após checagem externa. Nenhum documento sensível deve
            ser inserido aqui.
          </p>
          <label>
            Cliente
            <select
              value={verification.userId}
              onChange={(e) =>
                setVerification({ ...verification, userId: e.target.value })
              }
            >
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Referência da revisão
            <input
              required
              minLength={8}
              placeholder="KYC-2026-001 / análise externa"
              value={verification.reference}
              onChange={(e) =>
                setVerification({ ...verification, reference: e.target.value })
              }
            />
          </label>
          {[
            ["identityVerified", "Identidade verificada"],
            ["paymentVerified", "Pagamento verificado"],
          ].map(([key, title]) => (
            <label className="policy-check" key={key}>
              <input
                type="checkbox"
                checked={verification[key]}
                onChange={(e) =>
                  setVerification({ ...verification, [key]: e.target.checked })
                }
              />
              {title}
            </label>
          ))}
          <button className="primary" disabled={busy}>
            Registrar verificação
          </button>
        </form>
        <form
          className="panel settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await post("/admin/telemetry", traffic);
              notify(
                r.suspended
                  ? "Limite de abuso excedido: serviço suspenso e cliente notificado."
                  : "Observação de tráfego registrada.",
              );
            });
          }}
        >
          <h3>Ingestão de observação de tráfego</h3>
          <p>
            Entrada manual para validar a política. Um agente de rede real ainda
            precisa enviar estas observações.
          </p>
          <label>
            Serviço
            <select
              value={traffic.serviceId}
              onChange={(e) =>
                setTraffic({ ...traffic, serviceId: e.target.value })
              }
            >
              {data.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.status}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            {[
              ["connectionsPerMinute", "Conexões/min · limite 5.000"],
              ["smtpAttempts", "Tentativas SMTP · limite 10"],
              ["abuseReports", "Denúncias · limite 3"],
            ].map(([key, title]) => (
              <label key={key}>
                {title}
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  required
                  value={traffic[key]}
                  onChange={(e) =>
                    setTraffic({ ...traffic, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <button className="primary" disabled={busy}>
            Registrar observação
          </button>
        </form>
      </div>
      <section className="panel settings-form">
        <h3>Fila de incidentes · prioridade alta</h3>
        {data.incidents.length ? (
          data.incidents.map((i) => (
            <div className="incident-row" key={i.id}>
              <div>
                <b>{i.name}</b>
                <p>
                  Alta · {i.status} ·{" "}
                  {new Date(i.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
              {i.status === "open" && (
                <button
                  className="secondary"
                  disabled={busy || review.trim().length < 8}
                  onClick={() =>
                    run(async () => {
                      await post("/admin/unsuspend", {
                        serviceId: i.serviceId,
                        reason: review,
                      });
                      notify(
                        "Revisão concluída. Serviço liberado, ainda desligado.",
                      );
                    })
                  }
                >
                  Reativar após revisão
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="empty">Nenhum incidente registrado.</p>
        )}
        <label>
          Justificativa da revisão
          <input
            minLength={8}
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Informe a análise antes de reativar"
          />
        </label>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h3>Comissões & fechamento mensal</h3>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await post("/admin/payouts/run");
                notify(
                  r.status === "unconfigured"
                    ? "Stripe não configurado. Nenhum repasse realizado."
                    : `Fechamento: ${r.transfers} transferência(s) de teste.`,
                );
              })
            }
          >
            Executar fechamento pendente
          </button>
        </div>
        <p>
          O agendador tenta fechar comissões de meses anteriores a cada hora.
          Ganhos de demonstração e comissões em revisão são excluídos. O
          marketplace mantém os valores dos criadores pendentes de integração.
        </p>
        {data.payouts.map((p) => (
          <div className="file-row" key={p.id}>
            <b>{p.period}</b>
            <span>{p.status}</span>
            <strong>{brl(p.cents)}</strong>
          </div>
        ))}
      </section>
      <ErrorMessage message={error} />
    </>
  );
}
