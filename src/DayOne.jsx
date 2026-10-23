import React, { useEffect, useState } from "react";
import {
  Layers,
  Server,
  Wallet,
  LifeBuoy,
  ShieldCheck,
  Plus,
  ArrowRight,
  LogOut,
  RefreshCw,
  Globe,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { api, post } from "./api.js";
import { LegalFooter, LegalPage, SupportContact } from "./Legal.jsx";
import ServiceWizard from "./ServiceWizard.jsx";
import { TABLE, quote, brl } from "../shared/pricing.js";
export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <ErrorPage status={500} /> : this.props.children;
  }
}
export function ErrorPage({ status = 404, message }) {
  return (
    <div className="public-shell error-screen">
      <a className="public-brand" href="/">
        ◈ nexora
      </a>
      <section className="panel">
        <strong>{status}</strong>
        <h1>
          {status === 404
            ? "Este endereço não existe."
            : "Não foi possível carregar a página."}
        </h1>
        <p>
          {message ||
            "Tente novamente ou volte para o início. Se o problema continuar, entre em contato com o suporte."}
        </p>
        <a href="/" className="primary">
          Voltar ao início
        </a>
      </section>
    </div>
  );
}
export function AuthPage({ config, onLogin, initialMode = "login" }) {
  const path = location.pathname;
  const special =
    path === "/verificar-email"
      ? "verify"
      : path === "/redefinir-senha"
        ? "reset"
        : null;
  const [mode, setMode] = useState(special || initialMode),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const title = {
    login: "Seu workspace está esperando.",
    register: "Comece com uma conta segura.",
    forgot: "Recupere seu acesso.",
    verify: "Confirme seu e-mail.",
    reset: "Escolha uma nova senha.",
    resend: "Receba um novo link.",
  }[mode];
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await post(`/auth/${mode}`, {
        name,
        email,
        password,
        acceptedTerms: accepted,
        legalVersion: config.legalVersion,
        token: new URLSearchParams(location.search).get("token"),
      });
      if (mode === "login") {
        onLogin(result);
        return;
      }
      setMessage(result.message);
      if (mode === "verify" || mode === "reset") {
        history.replaceState(null, "", "/login");
        setMode("login");
        setPassword("");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="public-shell">
      <a className="public-brand" href="/">
        ◈ nexora <span className="tag">Beta · acesso antecipado</span>
      </a>
      <section className="panel auth-panel">
        <span className="eyebrow">NEXORA CLOUD</span>
        <h1>{title}</h1>
        <p>Jogos, bots e sites em uma única conta.</p>
        <form className="settings-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              Nome
              <input
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {!["verify", "reset"].includes(mode) && (
            <label>
              E-mail
              <input
                type="email"
                required
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <label>
              {mode === "reset" ? "Nova senha" : "Senha"}
              <input
                type="password" aria-label={mode==='reset'?'Nova senha':'Senha'}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode !== "login" && (
                <small>
                  Use pelo menos 12 caracteres e uma senha exclusiva.
                </small>
              )}
            </label>
          )}
          {mode === "register" && (
            <label className="policy-check">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                Li e aceito os{" "}
                <a href="/termos" target="_blank" rel="noopener">
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a href="/privacidade" target="_blank" rel="noopener">
                  Política de Privacidade
                </a>
                .
              </span>
            </label>
          )}
          {mode === "verify" && (
            <p>
              Clique abaixo para confirmar o endereço que recebeu o link. Não
              envie esse link a outras pessoas.
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Aguarde..."
              : {
                  login: "Entrar na conta",
                  register: "Criar conta",
                  forgot: "Enviar recuperação",
                  verify: "Confirmar meu e-mail",
                  reset: "Salvar nova senha",
                  resend: "Reenviar confirmação",
                }[mode]}
            <ArrowRight size={16} />
          </button>
        </form>
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="auth-links">
          {mode !== "login" && (
            <button
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
            >
              Já tenho conta · Entrar
            </button>
          )}
          {mode === "login" && (
            <>
              <button
                onClick={() => {
                  setMode("register");
                  setError("");
                  setMessage("");
                }}
              >
                Criar conta
              </button>
              <button onClick={() => setMode("forgot")}>
                Esqueci minha senha
              </button>
              <button onClick={() => setMode("resend")}>
                Reenviar confirmação
              </button>
            </>
          )}
        </div>
      </section>
      <LegalFooter config={config} />
    </div>
  );
}
export function PublicLanding({ config, onLogin }) {
  const [auth, setAuth] = useState(null);
  if (auth)
    return <AuthPage config={config} onLogin={onLogin} initialMode={auth} />;
  return (
    <div className="public-shell">
      <div className="public-nav">
        <a className="public-brand" href="/">
          ◈ nexora
        </a>
        <span className="tag">Beta · acesso antecipado</span>
        <button className="secondary" onClick={() => setAuth("login")}>
          Entrar no painel
        </button>
      </div>
      <section className="launch-hero">
        <span className="eyebrow">UM WORKSPACE. TODAS AS SUAS IDEIAS.</span>
        <h1>
          Seu próximo projeto
          <br />
          começa aqui.
        </h1>
        <p>
          Hospedagem de jogos, bots Discord e sites. Escolha seus recursos,
          confira o preço completo e gerencie seus serviços em uma única conta.
        </p>
        <button className="primary" onClick={() => setAuth("register")}>
          Criar minha conta <ArrowRight size={17} />
        </button>
        <p className="beta-note">
          Estamos em acesso antecipado.{" "}
          {config.checkoutAvailable
            ? "Contratações liberadas para as categorias disponíveis."
            : "Contratações públicas ainda não liberadas. Fale com a equipe para saber mais."}
        </p>
      </section>
      <div className="docs-grid">
        {["Jogos", "Bots Discord", "Sites"].map((category) => {
          const q = quote({ category, ram: 2, cpu: 1, disk: 20 });
          return (
            <section className="panel launch-plan" key={category}>
              <Server size={26} />
              <h2>{category}</h2>
              <p>Exemplo: 2 GB RAM · 1 vCPU · 20 GB disco · São Paulo</p>
              <div className="market-price">
                {brl(q.total)}
                <small>/mês</small>
              </div>
              <p>
                O preço final e a disponibilidade são confirmados antes do
                checkout. Nenhum recurso adicional é incluído sem indicação.
              </p>
              <button className="secondary" onClick={() => setAuth("register")}>
                Configurar no painel <ArrowRight size={14} />
              </button>
            </section>
          );
        })}
      </div>
      <SupportContact config={config} />
      <LegalFooter config={config} />
    </div>
  );
}
function Billing({ config }) {
  const [invoices, setInvoices] = useState([]),
    [subs, setSubs] = useState([]),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(null);
  async function load() {
    const [i, s] = await Promise.all([api("/invoices"), api("/subscriptions")]);
    setInvoices(i);
    setSubs(s);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <section className="panel">
        <h2>Assinaturas e renovação</h2>
        {subs.length ? (
          subs.map((s) => (
            <div className="file-row" key={s.id}>
              <div>
                <b>{s.name}</b>
                <p>
                  {brl(s.renewal)} a cada {s.months} mês(es)
                </p>
              </div>
              <span>
                {s.cancelAtPeriodEnd
                  ? "Renovação cancelada"
                  : s.subscriptionStatus === "cancelled"
                    ? "Encerrada"
                    : "Renovação automática"}
              </span>
              {!s.cancelAtPeriodEnd && s.subscriptionStatus !== "cancelled" && (
                <button className="secondary" onClick={() => setConfirm(s)}>
                  Cancelar renovação
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="empty">Nenhuma assinatura ativa.</p>
        )}
        {confirm && (
          <div className="warning">
            <div>
              <p>
                Cancelar a próxima renovação de <b>{confirm.name}</b>? O período
                já pago continua disponível. Para reembolso, consulte a
                política.
              </p>
              <div className="actions">
                <button className="secondary" onClick={() => setConfirm(null)}>
                  Voltar
                </button>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await post(`/orders/${confirm.id}/cancel-renewal`);
                      setConfirm(null);
                      await load();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Confirmar cancelamento
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Histórico de pagamentos</h2>
        {invoices.length ? (
          invoices.map((i) => (
            <div className="file-row" key={i.id}>
              <Wallet size={17} />
              <b>{new Date(i.date).toLocaleDateString("pt-BR")}</b>
              <span>
                {i.live ? "Pagamento confirmado" : "Demonstração / teste"}
              </span>
              <strong>{brl(i.total)}</strong>
            </div>
          ))
        ) : (
          <p className="empty">Nenhum pagamento registrado.</p>
        )}
        <p className="muted">
          O recibo é enviado ao e-mail da conta após a confirmação do gateway.{" "}
          <a href="/reembolsos">Reembolsos e cancelamento</a>.
        </p>
      </section>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
function Operations({ onError }) {
  const [status, setStatus] = useState(null),
    [token, setToken] = useState(""),
    [error, setError] = useState("");
  async function load() {
    try {
      setStatus(await api("/admin/launch"));
    } catch (e) {
      if (!e.message.includes("administrativo")) setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  if (!status)
    return (
      <form
        className="panel settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post("/admin/session", { token });
            setToken("");
            await load();
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <h2>Operação do lançamento</h2>
        <label>
          Token administrativo
          <input
            required
            autoComplete="off"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <button className="primary">Autenticar</button>
        {error && <p className="form-error">{error}</p>}
      </form>
    );
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <h2>Verificações reais do lançamento</h2>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await post("/admin/launch/probe");
                await load();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Verificar novamente
          </button>
        </div>
        {[
          ["Domínio e TLS apontando para esta instância", status.tls],
          ["Stripe live com cobranças habilitadas", status.stripe],
          ["E-mail transacional verificado", status.mail === true],
          ["Provisionador com isolamento declarado", !!status.provider],
          ["Backup externo íntegro e recente", status.backup?.status === "ok"],
          ["Compra live + entrega + três e-mails entregues", status.proof],
        ].map(([title, ok]) => (
          <div className="file-row" key={title}>
            <ShieldCheck size={17} />
            <b>{title}</b>
            <span className={ok ? "success-text" : "pending-text"}>
              {ok ? "Verificado" : "Pendente"}
            </span>
          </div>
        ))}
        <p className="muted">
          O modo público só libera checkout quando esses pré-requisitos estão
          satisfeitos. Apenas configurar chaves não valida o lançamento.
        </p>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await post("/admin/backup");
              await load();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Executar backup agora
        </button>
      </section>
      <section className="panel">
        <h2>E-mails transacionais</h2>
        {Array.isArray(status.mailEvents) ? (
          status.mailEvents.map((m) => (
            <div className="file-row" key={m.id}>
              <b>{m.kind}</b>
              <span>{m.status}</span>
              <small>{m.error}</small>
            </div>
          ))
        ) : (
          <p>Atualize para consultar as entregas.</p>
        )}
        <p className="muted">
          accepted = recebido pelo provedor; delivered = entrega confirmada por
          webhook assinado. Caixa de entrada/spam ainda deve ser conferida pelo
          destinatário.
        </p>
      </section>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
export function DayOneApp({ config, session, onLogout }) {
  const [runtime, setRuntime] = useState(config);
  const [page, setPage] = useState("Visão geral"),
    [services, setServices] = useState([]),
    [jobs, setJobs] = useState([]),
    [notifications, setNotifications] = useState([]),
    [detail, setDetail] = useState(null),
    [wizard, setWizard] = useState(false),
    [me, setMe] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  async function refresh() {
    const [s, j, n, m, c] = await Promise.all([
      api("/services"),
      api("/jobs"),
      api("/notifications"),
      api("/me"),
      api("/public/config"),
    ]);
    setRuntime(c);
    setServices(s);
    setJobs(j);
    setNotifications(n);
    setMe(m);
    const requested = new URLSearchParams(location.search).get("service");
    if (requested)
      setDetail(
        (current) => current || s.find((v) => v.id === requested) || null,
      );
    const last = sessionStorage.getItem("nexora-last-order");
    const ready = j.find((v) => v.orderId === last && v.status === "completed");
    if (ready) {
      setDetail(s.find((v) => v.id === ready.serviceId) || null);
      sessionStorage.removeItem("nexora-last-order");
    }
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      5000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api(`/services/${detail.id}`);
        if (!cancelled) setDetail(s);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [detail?.id]);
  const navigate = (p) => {
    setPage(p);
    setDetail(null);
    history.replaceState(null, "", "/");
    setError("");
  };
  async function action(type) {
    setBusy(true);
    setError("");
    try {
      const s = await post(`/services/${detail.id}/action`, { action: type });
      setDetail(s);
      await refresh();
      setNotice(
        "Operação enviada à infraestrutura. Aguarde a atualização do estado.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="launch-dashboard">
      <header className="launch-header">
        <a className="public-brand" href="/">
          ◈ nexora
        </a>
        <span className="tag">Beta · acesso antecipado</span>
        <span className="customer-name">{session.user.name}</span>
        <button className="secondary" onClick={onLogout}>
          <LogOut size={14} />
          Sair
        </button>
      </header>
      <div className="beta-banner">
        {config.production?'Acesso antecipado · Atendimento direto pelo suporte. Recursos indisponíveis não são oferecidos no checkout.':'Ambiente de desenvolvimento · Pagamentos e provisionamento são simulados.'}
      </div>
      <div className="launch-layout">
        <aside className="launch-nav">
          {[
            [Server, "Visão geral"],
            [Wallet, "Faturamento"],
            [LifeBuoy, "Suporte"],
            [ShieldCheck, "Operação"],
          ].map(([Icon, title]) => (
            <button
              key={title}
              className={page === title ? "active" : ""}
              onClick={() => navigate(title)}
            >
              <Icon size={17} />
              {title}
            </button>
          ))}
          {config.supportEmail && (
            <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>
          )}
        </aside>
        <main className="launch-main">
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="success-message" role="status">
              {notice}
              <button className="text-button" onClick={() => setNotice("")}>
                Fechar
              </button>
            </div>
          )}
          {detail ? (
            <>
              <div className="page-heading">
                <div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDetail(null);
                      history.replaceState(null, "", "/");
                    }}
                  >
                    ← Meus serviços
                  </button>
                  <h1>{detail.name}</h1>
                  <p>
                    {detail.type} · {detail.quote.specs.region}
                  </p>
                </div>
                <span className="tag">{detail.status}</span>
              </div>
              {detail.observationStale && (
                <p className="warning">
                  Não foi possível atualizar o estado da infraestrutura. Os
                  dados exibidos são a última observação disponível.
                </p>
              )}
              <section className="panel">
                <div className="panel-title">
                  <h2>Acesso ao serviço</h2>
                  <Server size={22} />
                </div>
                <div className="address-card">
                  <Globe size={20} />
                  <code>{detail.address}</code>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(detail.address);
                        setNotice("Endereço copiado.");
                      } catch {
                        setNotice("Copie o endereço exibido no painel.");
                      }
                    }}
                  >
                    <Copy size={14} />
                    Copiar
                  </button>
                </div>
                <p className="muted">
                  {detail.quote.specs.ram} GB RAM · {detail.quote.specs.cpu}{" "}
                  vCPU · {detail.quote.specs.disk} GB disco.
                </p>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={
                      busy || ["Cancelado", "Suspenso"].includes(detail.status)
                    }
                    onClick={() =>
                      action(detail.status === "Online" ? "stop" : "start")
                    }
                  >
                    {detail.status === "Online" ? "Parar" : "Iniciar"}
                  </button>
                  <button
                    className="secondary"
                    disabled={
                      busy || ["Cancelado", "Suspenso"].includes(detail.status)
                    }
                    onClick={() => action("restart")}
                  >
                    Reiniciar
                  </button>
                </div>
              </section>
              <section className="panel">
                <h2>Uso de recursos</h2>
                {detail.metricsAvailable ? (
                  <div className="stats">
                    <div className="stat">
                      <p>CPU</p>
                      <h2>{detail.cpu}%</h2>
                    </div>
                    <div className="stat">
                      <p>RAM</p>
                      <h2>{detail.ram} GB</h2>
                    </div>
                    <div className="stat">
                      <p>Disco</p>
                      <h2>{detail.disk} GB</h2>
                    </div>
                  </div>
                ) : (
                  <p>
                    Métricas ainda não disponibilizadas pelo provisionador. Não
                    exibimos dados simulados neste painel.
                  </p>
                )}
              </section>
              <SupportContact config={config} />
            </>
          ) : page === "Faturamento" ? (
            <Billing config={config} />
          ) : page === "Suporte" ? (
            <SupportContact config={config} />
          ) : page === "Operação" ? (
            <Operations />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SEU WORKSPACE</span>
                  <h1>Seus projetos, em um lugar.</h1>
                  <p>
                    Olá, {session.user.name}. Gerencie os serviços da sua conta.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!me?.canCheckout}
                  onClick={() => setWizard(true)}
                >
                  <Plus size={16} />
                  Contratar plano
                </button>
              </div>
              {!me?.canCheckout && (
                <div className="warning">
                  As contratações ainda não foram liberadas para esta conta. O
                  suporte está disponível abaixo.
                </div>
              )}
              <div className="search launch-search">
                <input
                  aria-label="Buscar serviços"
                  maxLength={128}
                  placeholder="Buscar serviços..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="service-grid">
                {services
                  .filter((s) =>
                    s.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((s) => (
                    <section className="service-card" key={s.id}>
                      <div className="card-top">
                        <div className="service-icon discord">
                          <Server size={24} />
                        </div>
                        <span className="tag">{s.status}</span>
                      </div>
                      <h3>{s.name}</h3>
                      <p className="service-type">
                        {s.type} · {s.quote.specs.region}
                      </p>
                      <p className="service-type">
                        {s.total} GB RAM · {s.capacity} GB disco
                      </p>
                      <div className="service-footer">
                        <span>Último estado registrado</span>
                        <button onClick={() => setDetail(s)}>
                          Abrir serviço <ArrowRight size={14} />
                        </button>
                      </div>
                    </section>
                  ))}
              </div>
              {!services.length && (
                <section className="panel empty">
                  <Server size={30} />
                  <h2>Pronto para seu primeiro projeto?</h2>
                  <p>
                    Quando a contratação estiver disponível, seus serviços
                    aparecerão aqui após a confirmação do pagamento e da
                    infraestrutura.
                  </p>
                </section>
              )}
              {jobs.filter((j) => j.status !== "completed").length > 0 && (
                <section className="panel">
                  <h2>Criação de serviços</h2>
                  {jobs
                    .filter((j) => j.status !== "completed")
                    .map((j) => (
                      <div className="file-row" key={j.id}>
                        <RefreshCw size={16} />
                        <div>
                          <b>{j.message}</b>
                          <p>
                            {j.status === "failed"
                              ? "Contate o suporte para revisão do pagamento e da entrega."
                              : `${j.progress}% · ${j.status}`}
                          </p>
                        </div>
                      </div>
                    ))}
                </section>
              )}
              <section className="panel">
                <h2>Notificações</h2>
                {notifications.length ? (
                  notifications.slice(0, 10).map((n) => (
                    <div className="file-row" key={n.id}>
                      <CheckCircle2 size={17} />
                      <div>
                        <b>{n.title}</b>
                        <p>{n.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>Nenhuma notificação por enquanto.</p>
                )}
              </section>
              <SupportContact config={config} />
            </>
          )}
          <LegalFooter config={config} />
        </main>
      </div>
      {wizard && (
        <ServiceWizard
          runtime={runtime}
          onClose={() => setWizard(false)}
          onCreated={async (service) => {
            setWizard(false);
            setDetail(service);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
