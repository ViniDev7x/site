import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ShoppingBag,
  Layers,
  LayoutDashboard,
  Server,
  Wallet,
  LifeBuoy,
  BookOpen,
  Gift,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Plus,
  Search,
  Bell,
  Activity,
  Check,
  Globe,
  Gamepad2,
  Bot,
  MoreHorizontal,
  ArrowRight,
  ShieldCheck,
  Zap,
  Clock,
  ExternalLink,
  X,
  Terminal,
  Folder,
  Database,
  Play,
  Square,
  RefreshCw,
  Copy,
  Settings,
  LogOut,
  Menu,
  Send,
  CheckCircle2,
  Cpu,
  HardDrive,
  Users,
} from "lucide-react";
import "./style.css";
import {
  AppErrorBoundary,
  ErrorPage,
  AuthPage,
  PublicLanding,
  DayOneApp,
} from "./DayOne.jsx";
import { LegalFooter, LegalPage, SupportContact } from "./Legal.jsx";
import { api, post } from "./api.js";
import { PlanCards, ServicePlanControls, PendingOrders } from "./Plans.jsx";
import ServiceWizard from "./ServiceWizard.jsx";
import Onboarding from "./Onboarding.jsx";
import ServiceSettings from "./ServiceSettings.jsx";
import {
  AffiliatePanel,
  Marketplace,
  AdminPanel,
  SecurityPanel,
  BillingPanel,
} from "./Growth.jsx";
const money = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function App({ runtime }) {
  const [page, setPage] = useState("Visão geral"),
    [services, setServices] = useState([]),
    [filter, setFilter] = useState("Todos os serviços"),
    [query, setQuery] = useState(""),
    [wizard, setWizard] = useState(false),
    [category, setCategory] = useState("Jogos"),
    [detail, setDetail] = useState(null),
    [tab, setTab] = useState("Console"),
    [toast, setToast] = useState(""),
    [notice, setNotice] = useState(false),
    [chat, setChat] = useState([]),
    [message, setMessage] = useState(""),
    [mobile, setMobile] = useState(false),
    [wizardConfig, setWizardConfig] = useState({}),
    [notifications, setNotifications] = useState([]),
    [apiError, setApiError] = useState(""),
    [brand, setBrand] = useState(null),
    [ready, setReady] = useState(false);
  const notify = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 4000);
  };
  async function refresh() {
    const [list, items] = await Promise.all([
      api("/services"),
      api("/notifications"),
    ]);
    setServices(list);
    setNotifications(items);
    setDetail((current) =>
      current ? list.find((s) => s.id === current.id) || null : null,
    );
  }
  useEffect(() => {
    const referral = new URLSearchParams(location.search).get("ref");
    if (referral && /^[a-z0-9]{12}$/.test(referral))
      localStorage.setItem("nexora-referral", referral);
    let alive = true;
    async function init() {
      try {
        await post("/session");
        const [list, items] = await Promise.all([
          api("/services"),
          api("/notifications"),
        ]);
        if (!alive) return;
        setServices(list);
        setNotifications(items);
        setReady(true);
        const requested = new URLSearchParams(location.search).get("service");
        if (requested) {
          const found = list.find((s) => s.id === requested);
          if (found) setDetail(found);
          else setApiError("Serviço do link não encontrado nesta conta.");
        }
        const [me, branding] = await Promise.all([
          api("/me"),
          api("/branding"),
        ]);
        if (alive) setBrand(branding.brand || me.affiliate?.brand || null);
        if (branding.referralCode)
          localStorage.setItem("nexora-referral", branding.referralCode);
        const code = localStorage.getItem("nexora-referral");
        if (code) {
          const storefront = await api(`/storefront/${code}`);
          if (alive) setBrand(storefront.brand);
        }
      } catch (e) {
        if (alive) setApiError(e.message);
      }
    }
    init();
    return () => {
      alive = false;
    };
  }, []);
  async function serviceAction(action, extra = {}) {
    try {
      const next = await post(`/services/${detail.id}/action`, {
        action,
        ...extra,
      });
      setDetail(next);
      setServices((items) => items.map((s) => (s.id === next.id ? next : s)));
      if (action === "restart")
        notify("Reinicialização de demonstração concluída.");
    } catch (e) {
      notify(e.message);
    }
  }
  const navigate = (p) => {
    setPage(p);
    setDetail(null);
    setMobile(false);
    refresh().catch((e) => setApiError(e.message));
  };
  const openWizard = () => {
    setWizardConfig({ category });
    setWizard(true);
  };
  const configure = (config) => {
    setWizardConfig(config);
    setWizard(true);
  };
  const onCreated = async (service) => {
    setWizard(false);
    setDetail(service);
    setTab("Console");
    await refresh();
    notify(
      "Serviço de demonstração criado. Confira o checklist de primeiros passos.",
    );
  };
  const nav = [
    {
      title: "PRINCIPAL",
      items: [
        [LayoutDashboard, "Visão geral"],
        [Server, "Meus serviços"],
        [Wallet, "Faturamento"],
        [LifeBuoy, "Suporte"],
      ],
    },
    {
      title: "EXPLORE",
      items: [
        [BookOpen, "Documentação"],

        [ShieldCheck, "Segurança"],
        [Settings, "Administração"],
      ],
    },
  ];
  return (
    <div className="app" style={brand ? { "--brand": brand.color } : undefined}>
      <aside className={mobile ? "sidebar opened" : "sidebar"}>
        <a className="brand" onClick={() => navigate("Visão geral")}>
          <div className="brand-symbol">
            <Layers size={24} />
          </div>
          {brand?.logo && (
            <img
              className="brand-logo"
              src={brand.logo}
              alt=""
              referrerPolicy="no-referrer"
            />
          )}
          {brand?.name || "nexora"}
          <span>®</span>
        </a>
        <button className="workspace">
          <div className="workspace-icon">V</div>
          <div>
            <b>Workspace pessoal</b>
            <small>Workspace de demonstração</small>
          </div>
          <ChevronDown size={15} />
        </button>
        <nav>
          {nav.map((group) => (
            <section key={group.title}>
              <label>{group.title}</label>
              {group.items.map(([Icon, title]) => (
                <button
                  key={title}
                  className={page === title ? "nav-item active" : "nav-item"}
                  onClick={() => navigate(title)}
                >
                  <Icon size={19} />
                  {title}
                  {title === "Meus serviços" && <em>{services.length}</em>}
                  {title === "Suporte" && <span className="nav-dot" />}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade">
            <span className="spark">✧</span>
            <b>
              Grandes ideias merecem
              <br />
              mais espaço.
            </b>
            <p>
              Conheça nossos planos e leve
              <br />
              seu projeto mais longe.
            </p>
            <button onClick={() => navigate("Planos")}>
              Explorar planos <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="system-status" onClick={() => navigate("Status")}>
            <i />
            Status dos serviços · demonstração
            <ArrowUpRight size={13} />
          </button>
          <button className="profile" onClick={() => navigate("Configurações")}>
            <div className="avatar">VC</div>
            <div>
              <b>Vinícius Costa</b>
              <small>Conta pessoal</small>
            </div>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            Workspace pessoal <ChevronRight size={14} />
            <span>{detail ? detail.name : page}</span>
          </div>
          <div className="header-right">
            <span className="demo">Beta · ambiente de demonstração</span>
            <button
              className="help-link"
              onClick={() => navigate("Documentação")}
            >
              <BookOpen size={15} />
              Central de ajuda
              <ArrowUpRight size={12} />
            </button>
            <div className="bell-wrap">
              <button
                className="icon-button"
                aria-label="Notificações"
                onClick={() => {
                  setNotice(!notice);
                  api("/notifications")
                    .then(setNotifications)
                    .catch((e) => notify(e.message));
                }}
              >
                <Bell size={19} />
                <i />
              </button>
              {notice && (
                <div className="notification">
                  <b>Notificações do workspace</b>
                  {notifications.length ? (
                    notifications.map((n) => (
                      <div className="notification-item" key={n.id}>
                        <strong>{n.title}</strong>
                        <p>{n.message}</p>
                        <small>
                          {new Date(n.createdAt).toLocaleString("pt-BR")}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p>Nenhuma notificação por enquanto.</p>
                  )}
                </div>
              )}
            </div>
            <div className="avatar small">VC</div>
          </div>
        </header>
        <main>
          {apiError && (
            <div className="warning" role="alert">
              {apiError}
            </div>
          )}
          {!ready && !apiError && (
            <p className="muted">Conectando ao workspace...</p>
          )}
          {detail ? (
            <>
              <div className="page-heading">
                <div>
                  <button
                    className="text-button"
                    onClick={() => setDetail(null)}
                  >
                    ← Voltar para os serviços
                  </button>
                  <h1>{detail.name}</h1>
                  <p>
                    {detail.type} · {detail.address}
                  </p>
                </div>
                <div className="actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      serviceAction(
                        detail.status === "Online" ? "stop" : "start",
                      )
                    }
                    disabled={detail.status === "Suspenso"}
                  >
                    {detail.status === "Online" ? (
                      <Square size={15} />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {detail.status === "Online" ? "Parar" : "Iniciar"}
                  </button>
                  <button
                    className="primary"
                    onClick={() => serviceAction("restart")}
                    disabled={detail.status === "Suspenso"}
                  >
                    <RefreshCw size={16} />
                    Reiniciar
                  </button>
                </div>
              </div>
              <div className="stats">
                <Stat
                  title="CPU"
                  value={detail.cpu + "%"}
                  icon={Cpu}
                  sub="Uso atual"
                />
                <Stat
                  title="Memória RAM"
                  value={detail.ram + " GB"}
                  icon={Activity}
                  sub={"de " + detail.total + " GB disponíveis"}
                />
                <Stat
                  title="Armazenamento"
                  value={detail.disk + " GB"}
                  icon={HardDrive}
                  sub={"de " + detail.capacity + " GB disponíveis"}
                />
                <Stat
                  title="Status"
                  value={detail.status}
                  icon={Server}
                  sub="Ambiente de demonstração"
                />
              </div>
              <Onboarding
                key={detail.id}
                service={detail}
                setTab={setTab}
                onChange={(next) => {
                  setDetail(next);
                  setServices((items) =>
                    items.map((s) => (s.id === next.id ? next : s)),
                  );
                }}
              />
              <div className="tabs">
                {["Console", "Arquivos", "Backups", "Configurações"].map(
                  (t) => (
                    <button
                      key={t}
                      className={tab === t ? "selected" : ""}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ),
                )}
              </div>
              <section className="panel detail-panel">
                {tab === "Console" ? (
                  <>
                    <div className="panel-title">
                      <h3>Console do serviço</h3>
                      <span className="status-badge">
                        <i />
                        {detail.status}
                      </span>
                    </div>
                    <div className="terminal">
                      [Nexora] Console de demonstração
                      <br />
                      [08:42:01 INFO] Inicializando {detail.type}...
                      <br />
                      [08:42:03 INFO] Dependências carregadas
                      <br />
                      <span>
                        [08:42:05 INFO] Serviço pronto. Aguardando conexões.
                      </span>
                    </div>
                    <form
                      className="console-input"
                      onSubmit={(e) => {
                        e.preventDefault();
                        notify("Comando recebido no console de demonstração.");
                        e.target.reset();
                      }}
                    >
                      <Terminal size={16} />
                      <input placeholder="Digite um comando..." required />
                      <button>
                        <Send size={16} />
                      </button>
                    </form>
                  </>
                ) : tab === "Arquivos" ? (
                  <>
                    <h3>Arquivos do serviço</h3>
                    {[
                      "config",
                      "logs",
                      "backups",
                      "server.properties",
                      "README.md",
                    ].map((f) => (
                      <div className="file-row">
                        <Folder size={17} />
                        {f}
                        <button
                          className="text-button"
                          onClick={() =>
                            notify(
                              "O acesso a arquivos reais requer conexão com o servidor SFTP.",
                            )
                          }
                        >
                          Abrir <ArrowUpRight size={14} />
                        </button>
                      </div>
                    ))}
                  </>
                ) : tab === "Backups" ? (
                  detail.quote.specs.plan ? (
                    <ServicePlanControls
                      key={detail.id}
                      service={detail}
                      onChange={setDetail}
                      onUpgrade={() => {
                        setWizardConfig({ upgradeService: detail });
                        setWizard(true);
                      }}
                    />
                  ) : (
                    <>
                      <div className="panel-title">
                        <h3>Backups automáticos</h3>
                        <button
                          className="secondary"
                          onClick={() =>
                            notify("Backup de demonstração criado.")
                          }
                        >
                          Criar backup
                        </button>
                      </div>
                      {["Hoje, 08:00", "Ontem, 08:00", "21 out, 08:00"].map(
                        (d) => (
                          <div className="file-row">
                            <Database size={18} />
                            {d}
                            <span>Backup completo</span>
                            <button
                              className="secondary"
                              onClick={() =>
                                notify("Restauração simulada concluída.")
                              }
                            >
                              Restaurar
                            </button>
                          </div>
                        ),
                      )}
                    </>
                  )
                ) : (
                  <>
                    <h3>Configurações</h3>
                    <label>
                      Nome do serviço
                      <input
                        defaultValue={detail.name}
                        onBlur={(e) => {
                          if (e.target.value !== detail.name)
                            serviceAction("rename", { name: e.target.value });
                        }}
                      />
                    </label>
                    {detail.quote.specs.plan && (
                      <ServicePlanControls
                        key={detail.id}
                        service={detail}
                        onChange={setDetail}
                        onUpgrade={() => {
                          setWizardConfig({ upgradeService: detail });
                          setWizard(true);
                        }}
                      />
                    )}
                    <ServiceSettings
                      key={detail.id}
                      service={detail}
                      notify={notify}
                      onChange={(next) => {
                        setDetail(next);
                        setServices((items) =>
                          items.map((s) => (s.id === next.id ? next : s)),
                        );
                      }}
                    />
                  </>
                )}
              </section>
            </>
          ) : ["Visão geral", "Meus serviços"].includes(page) ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">SEU WORKSPACE, SEM LIMITES</div>
                  <h1>
                    {page === "Visão geral"
                      ? "Tudo sob seu controle."
                      : "Meus serviços"}
                  </h1>
                  <p>
                    {page === "Visão geral"
                      ? "Bom dia, Vinícius 👋 Veja o que acontece com seus projetos."
                      : "Gerencie seus jogos, bots e sites em um só lugar."}
                  </p>
                </div>
                <button className="primary" onClick={openWizard}>
                  <Plus size={18} />
                  Criar serviço
                </button>
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-label">
                    <span />
                    INFRAESTRUTURA QUE ACOMPANHA VOCÊ
                  </span>
                  <h2>
                    Suas ideias.
                    <br />
                    Nossa infraestrutura.
                  </h2>
                  <p>
                    Do primeiro deploy ao próximo grande servidor.
                    <br />
                    Jogos, bots e sites, conectados em um só lugar.
                  </p>
                  <button onClick={openWizard}>
                    Vamos criar algo <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="hero-art">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-line" />
                  <div className="float-card game-float">
                    <Gamepad2 size={23} />
                    <div>
                      <b>Game servers</b>
                      <small>Jogue sem limites.</small>
                    </div>
                    <i />
                  </div>
                  <div className="server-stack">
                    <div>
                      <Layers size={38} />
                      <span>NEXORA CLOUD</span>
                    </div>
                    <div className="rack">
                      <i />
                      <i />
                      <i />
                      <b>•••</b>
                    </div>
                    <div className="rack">
                      <i />
                      <i />
                      <i />
                      <b>•••</b>
                    </div>
                    <div className="rack">
                      <i />
                      <i />
                      <i />
                      <b>•••</b>
                    </div>
                  </div>
                  <div className="float-card bot-float">
                    <Bot size={22} />
                    <div>
                      <b>Discord bots</b>
                      <small>Sempre disponíveis.</small>
                    </div>
                  </div>
                  <div className="float-card web-float">
                    <Globe size={23} />
                    <div>
                      <b>Web hosting</b>
                      <small>Seu próximo deploy.</small>
                    </div>
                    <span>↗</span>
                  </div>
                  <div className="art-dot d1" />
                  <div className="art-dot d2" />
                  <div className="art-star">✧</div>
                </div>
              </section>
              <div className="stats">
                <Stat
                  title="Serviços ativos"
                  value={String(
                    services.filter((s) => s.status === "Online").length,
                  ).padStart(2, "0")}
                  icon={Server}
                  sub={
                    <>
                      <span className="green-dot" />
                      Serviços online no workspace
                    </>
                  }
                />
                <Stat
                  title="Memória em uso"
                  value={services
                    .reduce((n, s) => n + s.ram, 0)
                    .toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                  unit="GB"
                  icon={Activity}
                  sub={
                    <>
                      <span className="mini-bar">
                        <i />
                      </span>
                      de {services.reduce((n, s) => n + s.total, 0)} GB
                      disponíveis
                    </>
                  }
                />
                <Stat
                  title="Armazenamento"
                  value={services
                    .reduce((n, s) => n + s.disk, 0)
                    .toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                  unit="GB"
                  icon={Database}
                  sub={
                    <>
                      <span className="mini-bar blue">
                        <i />
                      </span>
                      de {services.reduce((n, s) => n + s.capacity, 0)} GB
                      disponíveis
                    </>
                  }
                />
                <Stat
                  title="Mensal equivalente"
                  value={money(services.reduce((v, s) => v + s.cost, 0))}
                  icon={Wallet}
                  sub={
                    <>
                      Tabela demonstrativa <span className="paid">Em dia</span>
                    </>
                  }
                />
              </div>
              <section className="services-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Seus serviços <span>{services.length}</span>
                    </h2>
                    <p>Um lugar para gerenciar tudo o que você cria.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setFilter("Todos os serviços");
                      setQuery("");
                      navigate("Meus serviços");
                    }}
                  >
                    Ver todos os serviços <ArrowRight size={15} />
                  </button>
                </div>
                <div className="service-toolbar">
                  <div className="tabs">
                    {[
                      "Todos os serviços",
                      "Jogos",
                      "Bots Discord",
                      "Sites",
                    ].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "selected" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="search">
                    <Search size={16} />
                    <input
                      placeholder="Buscar serviço..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd>⌘ K</kbd>
                  </div>
                </div>
                <PendingOrders />
                <div className="service-grid">
                  {services
                    .filter(
                      (s) =>
                        (filter === "Todos os serviços" ||
                          s.category === filter) &&
                        s.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <article className="service-card" key={s.id}>
                        <div className="card-top">
                          <div className={"service-icon " + s.style}>
                            {s.icon === "bot" ? (
                              <Bot size={27} />
                            ) : s.icon === "globe" ? (
                              <Globe size={27} />
                            ) : (
                              <span>{s.icon}</span>
                            )}
                          </div>
                          <span
                            className={
                              "status-badge " +
                              (s.status === "Offline" ? "offline" : "")
                            }
                          >
                            <i />
                            {s.status}
                          </span>
                          <button
                            className="more"
                            aria-label={"Gerenciar " + s.name}
                            onClick={() => setDetail(s)}
                          >
                            <MoreHorizontal size={20} />
                          </button>
                        </div>
                        <h3>{s.name}</h3>
                        <p className="service-type">{s.type}</p>
                        <div className="service-location">
                          <span>
                            {s.quote?.specs.region?.startsWith("Miami")
                              ? "🇺🇸"
                              : s.quote?.specs.region?.startsWith("Frankfurt")
                                ? "🇩🇪"
                                : "🇧🇷"}
                          </span>
                          {s.quote?.specs.region || "São Paulo, BR"}{" "}
                          <span className="location-dot">·</span>
                          <span className="ping">↗ 12 ms</span>
                        </div>
                        <div className="metrics">
                          <Metric
                            title="CPU"
                            value={s.cpu + "%"}
                            percent={s.cpu}
                          />
                          <Metric
                            title="RAM"
                            value={`${String(s.ram).replace(".", ",")} / ${s.total} GB`}
                            percent={(s.ram / s.total) * 100}
                          />
                          <Metric
                            title="Disco"
                            value={`${String(s.disk).replace(".", ",")} / ${s.capacity} GB`}
                            percent={(s.disk / s.capacity) * 100}
                          />
                        </div>
                        <div className="service-footer">
                          <span>
                            <span className="live-dot" />
                            Atualizado agora
                          </span>
                          <button
                            onClick={() => {
                              setDetail(s);
                              setTab("Console");
                            }}
                          >
                            Gerenciar <ArrowUpRight size={15} />
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
                {!services.filter(
                  (s) =>
                    (filter === "Todos os serviços" || s.category === filter) &&
                    s.name.toLowerCase().includes(query.toLowerCase()),
                ).length && (
                  <div className="empty">Nenhum serviço encontrado.</div>
                )}
              </section>
              <div className="bottom-grid">
                <section className="panel activity-panel">
                  <div className="panel-title">
                    <h3>Últimas atividades</h3>
                    <Clock size={17} />
                  </div>
                  <div className="activity-row">
                    <span className="activity-icon">
                      <Database size={16} />
                    </span>
                    <div>
                      <b>Backup realizado com sucesso</b>
                      <p>Survival dos amigos · Backup automático</p>
                    </div>
                    <time>Há 2 horas</time>
                  </div>
                  <div className="activity-row">
                    <span className="activity-icon purple">
                      <CheckCircle2 size={16} />
                    </span>
                    <div>
                      <b>Deploy concluído</b>
                      <p>Meu portfólio · Branch main</p>
                    </div>
                    <time>Há 4 horas</time>
                  </div>
                </section>
                <section className="support-card">
                  <div className="support-symbol">
                    <LifeBuoy size={23} />
                  </div>
                  <div>
                    <h3>Seu projeto não precisa esperar.</h3>
                    <p>
                      Nosso time está por aqui, 24 horas por dia.
                      <br />
                      Conte com pessoas que entendem do assunto.
                    </p>
                    <button onClick={() => navigate("Suporte")}>
                      Falar com a equipe <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <span className="support-decoration">✧</span>
                </section>
              </div>
              <LegalFooter config={runtime} />
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">NEXORA CLOUD</div>
                  <h1>{page}</h1>
                  <p>
                    Seu próximo nível começa com uma infraestrutura simples.
                  </p>
                </div>
                {page === "Planos" && (
                  <button className="primary" onClick={openWizard}>
                    <Plus size={16} />
                    Criar serviço
                  </button>
                )}
              </div>
              {page === "Faturamento" ? (
                <BillingPanel />
              ) : page === "Suporte" ? (
                <SupportContact config={runtime} />
              ) : page === "Status" ? (
                <section className="panel">
                  <div className="status-banner">
                    <CheckCircle2 size={26} />
                    <h2>Status dos serviços · demonstração</h2>
                    <span>Dados demonstrativos</span>
                  </div>
                  {[
                    "São Paulo · Jogos",
                    "São Paulo · Bots Discord",
                    "São Paulo · Hospedagem web",
                    "API e painel de controle",
                  ].map((n) => (
                    <div className="file-row">
                      <Server size={18} />
                      <b>{n}</b>
                      <div className="uptime">
                        {Array.from({ length: 40 }, (_, i) => (
                          <i key={i} />
                        ))}
                      </div>
                      <span className="ping">99,99%</span>
                    </div>
                  ))}
                  <h3>Histórico de incidentes</h3>
                  <p>Nenhum incidente registrado na demonstração.</p>
                </section>
              ) : page === "Documentação" ? (
                <div className="docs-grid">
                  {[
                    [
                      "Seu primeiro servidor",
                      "Escolha o jogo, configure os recursos e crie seu serviço.",
                    ],
                    [
                      "Deploy de bots Discord",
                      "Escolha Node.js ou Python e conecte seu repositório.",
                    ],
                    [
                      "Coloque seu site no ar",
                      "Conecte o Git e defina seu comando de build.",
                    ],
                    [
                      "Backups e restauração",
                      "Abra seu serviço → Backups → Restaurar.",
                    ],
                    [
                      "Domínios e SSL",
                      "Adicione seu domínio nas configurações do serviço.",
                    ],
                    [
                      "Proteja sua conta",
                      "Use uma senha exclusiva e habilite 2FA em produção.",
                    ],
                  ].map(([t, d]) => (
                    <div className="panel">
                      <BookOpen size={22} />
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  ))}
                </div>
              ) : page === "Afiliados" ? (
                <AffiliatePanel
                  notify={notify}
                  onBrand={setBrand}
                  onConfigure={configure}
                />
              ) : page === "Marketplace" ? (
                <Marketplace onConfigure={configure} />
              ) : page === "Segurança" ? (
                <SecurityPanel />
              ) : page === "Administração" ? (
                <AdminPanel notify={notify} />
              ) : page === "Configurações" ? (
                <section className="panel">
                  <h3>Perfil do workspace</h3>
                  <label>
                    Nome
                    <input defaultValue="Vinícius Costa" />
                  </label>
                  <label>
                    E-mail
                    <input type="email" defaultValue="vinicius@example.com" />
                  </label>
                  <button
                    className="primary"
                    onClick={() =>
                      notify("Preferências salvas nesta demonstração.")
                    }
                  >
                    Salvar preferências
                  </button>
                  <div className="file-row">
                    <ShieldCheck size={18} />
                    Autenticação de dois fatores
                    <span>Disponível após integração de autenticação</span>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => navigate("Administração")}
                  >
                    Abrir visão administrativa
                  </button>
                </section>
              ) : (
                <section className="panel">
                  <h2>Planos para começar e crescer</h2>
                  <p>
                    Free sem cartão. Preços para jogos em São Paulo; confira sua
                    categoria no wizard.
                  </p>
                  <PlanCards
                    onSelect={(plan) => {
                      setWizardConfig({ category: "Jogos", plan });
                      setWizard(true);
                    }}
                  />
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {wizard && (
        <ServiceWizard
          runtime={runtime}
          upgradeService={wizardConfig.upgradeService}
          initialPlan={wizardConfig.plan || "free"}
          onClose={() => setWizard(false)}
          onCreated={onCreated}
          initialCategory={wizardConfig.category}
          initialTemplate={wizardConfig.template}
          addonPreset={wizardConfig.addons}
          initialAgency={wizardConfig.agency}
        />
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
          <button onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function Stat({ title, value, unit, icon: Icon, sub }) {
  return (
    <div className="stat">
      <div className="stat-title">
        {title}
        <Icon size={17} />
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}
function Metric({ title, value, percent }) {
  return (
    <div className="metric">
      <div>
        <span>{title}</span>
        <b>{value}</b>
      </div>
      <div className="progress">
        <i style={{ width: Math.max(percent, 2) + "%" }} />
      </div>
    </div>
  );
}
function RuntimeGate() {
  const [config, setConfig] = useState(null),
    [session, setSession] = useState(null),
    [failure, setFailure] = useState("");
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const c = await api("/public/config");
        const s = await post("/session");
        if (alive) {
          setConfig(c);
          setSession(s);
        }
      } catch (e) {
        if (alive) setFailure(e.message);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);
  if (failure) return <ErrorPage status={500} message={failure} />;
  if (!config)
    return (
      <div className="public-shell">
        <p>Carregando Nexora...</p>
      </div>
    );
  const path = location.pathname;
  if (["/termos", "/privacidade", "/reembolsos"].includes(path))
    return <LegalPage config={config} type={path.slice(1)} />;
  if (
    ![
      "/",
      "/login",
      "/cadastro",
      "/verificar-email",
      "/redefinir-senha",
      "/status",
    ].includes(path)
  )
    return <ErrorPage status={404} />;
  const loggedIn = (result) => {
    history.replaceState(null, "", "/");
    setSession(result);
  };
  if (
    ["/verificar-email", "/redefinir-senha"].includes(path) ||
    (!session?.user && ["/login", "/cadastro"].includes(path))
  )
    return (
      <AuthPage
        config={config}
        onLogin={loggedIn}
        initialMode={path === "/cadastro" ? "register" : "login"}
      />
    );
  if (config.production || config.requireLogin) {
    if (!session?.user)
      return <PublicLanding config={config} onLogin={loggedIn} />;
    return (
      <DayOneApp
        config={config}
        session={session}
        onLogout={async () => {
          try {
            await post("/auth/logout");
            sessionStorage.removeItem("nexora-last-order");
            setSession(null);
            history.replaceState(null, "", "/");
          } catch (e) {
            setFailure(e.message);
          }
        }}
      />
    );
  }
  return <App runtime={config} />;
}
createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <RuntimeGate />
  </AppErrorBoundary>,
);
