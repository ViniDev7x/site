import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Check,
  ArrowRight,
  Gamepad2,
  Bot,
  Globe,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { TABLE, CATALOG, quote, brl } from "../shared/pricing.js";
import { api, post } from "./api.js";
export function PriceBreakdown({ value: q, compact = false }) {
  return (
    <section
      className={"price-breakdown " + (compact ? "compact-price" : "")}
      aria-live="polite"
      aria-label="Detalhamento do preço"
    >
      <div className="panel-title">
        <h3>Preço transparente</h3>
        <span className="tag">{TABLE.cycles[q.specs.cycle].label}</span>
      </div>
      {!compact && (
        <>
          <p className="muted">
            Base: RAM {brl(TABLE.resources.ram)}/GB · CPU{" "}
            {brl(TABLE.resources.cpu)}/core · Disco {brl(TABLE.resources.disk)}
            /GB.
          </p>
          <p className="muted">
            Fator região ×{q.regionFactor} · Serviço ×{q.typeFactor}. Fatores
            aplicados somente ao hardware.
          </p>
          {[...q.resourceLines, ...q.addonLines].map((l) => (
            <div className="price-row" key={l.key}>
              <span>{l.label}</span>
              <b>
                {brl(l.cents)}
                <small>/mês</small>
              </b>
            </div>
          ))}
          {q.marginCents > 0 && (
            <div className="price-row">
              <span>Margem da revenda ({q.margin}%)</span>
              <b>{brl(q.marginCents)}/mês</b>
            </div>
          )}
          {q.planCents > 0 && (
            <div className="price-row">
              <span>{TABLE.agency[q.specs.agency].label}</span>
              <b>{brl(q.planCents)}/mês</b>
            </div>
          )}
          <div className="price-row">
            <span>
              Subtotal recorrente · {q.months}{" "}
              {q.months === 1 ? "mês" : "meses"}
            </span>
            <b>{brl(q.monthly * q.months)}</b>
          </div>
          {q.discount > 0 && (
            <div className="price-row savings">
              <span>Desconto de {q.discountPercent}% no ciclo</span>
              <b>− {brl(q.discount)}</b>
            </div>
          )}
          {q.once > 0 && (
            <div className="price-row">
              <span>Template · licença única, sem desconto</span>
              <b>{brl(q.once)}</b>
            </div>
          )}
        </>
      )}
      <div className="checkout-total">
        <span>{compact ? "Total do ciclo" : "Total a pagar agora"}</span>
        <b data-testid="price-total">{brl(q.total)}</b>
      </div>
      <p>
        {brl(q.monthlyEquivalent)}/mês equivalente · cobrança a cada {q.months}{" "}
        {q.months === 1 ? "mês" : "meses"}.
      </p>
      <p className="muted">
        Renovação: {brl(q.renewal)} por ciclo, nas mesmas condições. Tributos
        incluídos na tabela demonstrativa; sem taxas adicionais no checkout.
        Templates não se repetem na renovação.
      </p>
    </section>
  );
}
export default function ServiceWizard({
  onClose,
  onCreated,
  runtime = { production: false, features: { growth: false } },
  initialCategory = runtime.categories?.[0] || "Jogos",
  initialTemplate = null,
  addonPreset = null,
  initialAgency = "personal",
}) {
  const growth = runtime.features?.growth === true;
  const [step, setStep] = useState(1),
    [specs, setSpecs] = useState({
      category: initialCategory,
      ram: Math.min(4, runtime.capabilities?.limits.ram || 4),
      cpu: Math.min(2, runtime.capabilities?.limits.cpu || 2),
      disk: Math.min(40, runtime.capabilities?.limits.disk || 40),
      region: runtime.capabilities?.regions?.[0] || "São Paulo, BR",
      cycle: "monthly",
      addons: growth ? addonPreset || {} : {},
      agency: growth ? initialAgency : "personal",
      template: growth ? initialTemplate : null,
    });
  const [name, setName] = useState(""),
    [subtype, setSubtype] = useState(
      runtime.production
        ? runtime.capabilities?.types?.[initialCategory]?.[0]
        : initialTemplate
          ? CATALOG.find((p) => p.id === initialTemplate)?.subtype
          : initialCategory === "Jogos"
            ? "Minecraft"
            : initialCategory === "Sites"
              ? "Next.js"
              : "Node.js",
    );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState(null),
    [accepted, setAccepted] = useState(false),
    [upload, setUpload] = useState(null),
    [uploading, setUploading] = useState(false),
    [scanError, setScanError] = useState(""),
    [authoritative, setAuthoritative] = useState(null),
    [paymentMode, setPaymentMode] = useState(
      runtime.production ? "stripe" : "demo",
    ),
    [stripeReady, setStripeReady] = useState(false),
    [margin, setMargin] = useState(0),
    [identity, setIdentity] = useState(null);
  const requestId = useRef(crypto.randomUUID());
  const referralCode = growth
    ? localStorage.getItem("nexora-referral") || ""
    : "";
  const localQuote = quote(specs, margin);
  const inputKey = JSON.stringify({ ...specs, referralCode });
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, [inputKey, subtype, name, upload?.id, paymentMode]);
  useEffect(() => {
    api("/me")
      .then((v) => {
        setStripeReady(v.stripeConfigured);
        setIdentity(v.user);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    setAuthoritative(null);
    setError("");
    const timer = setTimeout(
      () =>
        post("/quote", JSON.parse(inputKey))
          .then((q) => {
            if (active) {
              setAuthoritative(q);
              setMargin(q.margin);
            }
          })
          .catch((e) => active && setError(e.message)),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inputKey]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const next = await api(`/jobs/${job.id}`);
        if (stopped) return;
        setJob(next);
        if (next.status === "completed") {
          clearInterval(timer);
          onCreated(await api(`/services/${next.serviceId}`));
        }
        if (next.status === "failed") {
          setError(`${next.message} Alterações revertidas.`);
          setBusy(false);
        }
      } catch (e) {
        if (!stopped) {
          setError(e.message);
          setBusy(false);
        }
      }
    }, 600);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  function change(key, value) {
    setSpecs((s) => ({ ...s, [key]: value }));
    requestId.current = crypto.randomUUID();
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!authoritative)
        throw new Error("Aguarde a cotação validada pelo servidor.");
      const result = await post("/orders", {
        ...specs,
        referralCode,
        name: name.trim() || "Meu novo serviço",
        subtype,
        uploadId: upload?.id,
        acceptedPolicy: accepted ? "2026-10-v1" : null,
        requestId: requestId.current,
        expectedTotal: authoritative.total,
        priceVersion: authoritative.version,
        paymentMode,
        acceptedLegalVersion: accepted ? runtime.legalVersion : null,
      });
      if (result.url) {
        sessionStorage.setItem("nexora-last-order", result.order.id);
        window.location.assign(result.url);
        return;
      }
      if (!result.job)
        throw new Error(
          "Pedido registrado. Confirmação de pagamento pendente.",
        );
      setJob(result.job);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function scan(file) {
    if (!file) return;
    setUploading(true);
    setUpload(null);
    setScanError("");
    try {
      if (file.size > 512 * 1024)
        throw new Error("Máximo de 512 KB por upload nesta versão.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let raw = "";
      for (const b of bytes) raw += String.fromCharCode(b);
      const result = await post("/uploads", {
        filename: file.name,
        content: btoa(raw),
      });
      setUpload(result);
    } catch (e) {
      setScanError(e.message);
    } finally {
      setUploading(false);
    }
  }
  const q = authoritative || localQuote;
  return (
    <div className="modal-overlay">
      <section
        className="wizard extended-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Criar serviço"
      >
        <div className="panel-title">
          <div>
            <div className="eyebrow">SEU PROJETO, SEU JEITO</div>
            <h2>Criar serviço</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Fechar"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="wizard-steps">
          {[
            "Categoria",
            "Tecnologia",
            "Configuração",
            "Recursos",
            "Resumo",
          ].map((t, i) => (
            <div key={t} className={step >= i + 1 ? "current" : ""}>
              <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
              {t}
            </div>
          ))}
        </div>
        {busy && job ? (
          <div className="provision">
            <RefreshCw className="spinning" size={40} />
            <h2>{job.message}</h2>
            <div className="progress job-progress">
              <i style={{ width: job.progress + "%" }} />
            </div>
            <p>
              {job.progress}% · Worker persistente de demonstração. Nenhum
              container real.
            </p>
          </div>
        ) : (
          <>
            <div className="wizard-body">
              {step === 1 ? (
                <>
                  <h3>O que você vai criar?</h3>
                  <p>Uma infraestrutura. Todas as possibilidades.</p>
                  <div className="category-options">
                    {[
                      [Gamepad2, "Jogos", "Seu mundo, suas regras."],
                      [Bot, "Bots Discord", "Sua comunidade sempre online."],
                      [Globe, "Sites", "Sua ideia no ar."],
                    ]
                      .filter(
                        ([, t]) =>
                          !runtime.production ||
                          runtime.categories?.includes(t),
                      )
                      .map(([Icon, t, d]) => (
                        <button
                          key={t}
                          className={specs.category === t ? "chosen" : ""}
                          onClick={() => {
                            setSpecs({
                              ...specs,
                              category: t,
                              addons: {},
                              template:
                                specs.category === t ? specs.template : null,
                            });
                            setSubtype(
                              runtime.production
                                ? runtime.capabilities.types[t][0]
                                : t === "Jogos"
                                  ? "Minecraft"
                                  : t === "Sites"
                                    ? "Next.js"
                                    : "Node.js",
                            );
                            setUpload(null);
                            setScanError("");
                          }}
                        >
                          <Icon size={27} />
                          <b>{t}</b>
                          <small>{d}</small>
                        </button>
                      ))}
                  </div>
                </>
              ) : step === 2 ? (
                <>
                  <h3>Escolha sua tecnologia</h3>
                  <div className="technology-options">
                    {(specs.category === "Jogos"
                      ? ["Minecraft", "FiveM", "Rust", "ARK"]
                      : specs.category === "Sites"
                        ? ["Next.js", "Estático", "PHP", "Python / Django"]
                        : ["Node.js", "Python"]
                    )
                      .filter(
                        (t) =>
                          !runtime.production ||
                          runtime.capabilities?.types?.[
                            specs.category
                          ]?.includes(t),
                      )
                      .map((t) => (
                        <button
                          key={t}
                          className={
                            "secondary " + (subtype === t ? "chosen" : "")
                          }
                          onClick={() => setSubtype(t)}
                        >
                          {t}
                          {subtype === t && <Check size={16} />}
                        </button>
                      ))}
                  </div>
                  {growth && (
                    <>
                      {" "}
                      <label>
                        Template do marketplace
                        <select
                          value={specs.template || ""}
                          onChange={(e) => {
                            change("template", e.target.value || null);
                            const product = CATALOG.find(
                              (p) => p.id === e.target.value,
                            );
                            if (product) setSubtype(product.subtype);
                          }}
                        >
                          <option value="">Sem template</option>
                          {CATALOG.filter(
                            (p) => p.category === specs.category,
                          ).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title} · {brl(p.cents)} uma vez
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </>
              ) : step === 3 ? (
                <>
                  <h3>Configure seu projeto</h3>
                  <label>
                    Nome do serviço
                    <input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        requestId.current = crypto.randomUUID();
                      }}
                      maxLength={80}
                      placeholder="Meu projeto incrível"
                    />
                  </label>
                  <p>
                    Endereço e backup serão configurados no checklist
                    pós-criação. Tokens e comandos de clientes não são
                    executados pelo worker de demonstração.
                  </p>
                  {runtime.features?.uploads && specs.category !== "Jogos" && (
                    <div className="upload-box">
                      <label>
                        Arquivo ZIP ou código · até 512 KB
                        <input
                          type="file"
                          accept=".zip,.js,.py,.html,.css,.json,.txt"
                          disabled={uploading}
                          onChange={(e) => scan(e.target.files[0])}
                        />
                      </label>
                      {uploading ? (
                        <p>Arquivo em quarentena. Aguardando ClamAV...</p>
                      ) : upload ? (
                        <p className="savings">
                          Scan aprovado: {upload.filename}
                        </p>
                      ) : (
                        <p>
                          Upload opcional. Não inclua credenciais. Scanner
                          ausente bloqueia o arquivo.
                        </p>
                      )}
                      {scanError && (
                        <>
                          <p role="alert" className="form-error">
                            {scanError}
                          </p>
                          <button
                            className="secondary"
                            onClick={() => {
                              setScanError("");
                              setUpload(null);
                            }}
                          >
                            Continuar sem upload
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : step === 4 ? (
                <>
                  <h3>Espaço para crescer.</h3>
                  <div className="resource-inputs">
                    {[
                      [
                        "ram",
                        "Memória RAM",
                        "GB",
                        1,
                        runtime.production
                          ? runtime.capabilities?.limits.ram || 8
                          : 64,
                      ],
                      [
                        "cpu",
                        "CPU",
                        "vCPU",
                        1,
                        runtime.production
                          ? runtime.capabilities?.limits.cpu || 4
                          : 32,
                      ],
                      [
                        "disk",
                        "Disco NVMe",
                        "GB",
                        10,
                        runtime.production
                          ? runtime.capabilities?.limits.disk || 100
                          : 1000,
                      ],
                    ].map(([k, t, u, min, max]) => (
                      <label key={k}>
                        {t}
                        <div className="resource-number">
                          <input
                            type="number"
                            aria-label={t}
                            min={min}
                            max={max}
                            value={specs[k]}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isInteger(v) && v >= min && v <= max)
                                change(k, v);
                            }}
                          />
                          <span>{u}</span>
                        </div>
                        <input
                          aria-label={t + " slider"}
                          type="range"
                          min={min}
                          max={max}
                          value={specs[k]}
                          onChange={(e) => change(k, Number(e.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="form-grid">
                    <label>
                      Localização
                      <select
                        value={specs.region}
                        onChange={(e) => change("region", e.target.value)}
                      >
                        {Object.keys(TABLE.regions)
                          .filter(
                            (r) =>
                              !runtime.production ||
                              runtime.capabilities?.regions.includes(r),
                          )
                          .map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Ciclo de cobrança
                      <select
                        value={specs.cycle}
                        onChange={(e) => change("cycle", e.target.value)}
                      >
                        {Object.entries(TABLE.cycles).map(([k, c]) => (
                          <option key={k} value={k}>
                            {c.label}
                            {c.discount
                              ? " · " + c.discount * 100 + "% OFF"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {growth && (
                    <>
                      {" "}
                      <label>
                        Plano de gestão
                        <select
                          value={specs.agency}
                          onChange={(e) => change("agency", e.target.value)}
                        >
                          {Object.entries(TABLE.agency).map(([k, p]) => (
                            <option key={k} value={k}>
                              {p.label} · {brl(p.cents)}/mês
                            </option>
                          ))}
                        </select>
                      </label>
                      <h3>Adicione o que precisa</h3>
                      <div className="addon-options">
                        {Object.entries(TABLE.addons)
                          .filter(([, a]) =>
                            a.categories.includes(specs.category),
                          )
                          .map(([k, a]) => (
                            <label className="addon-option" key={k}>
                              <input
                                type="checkbox"
                                checked={!!specs.addons[k]}
                                onChange={(e) =>
                                  change("addons", {
                                    ...specs.addons,
                                    [k]: e.target.checked ? 1 : 0,
                                  })
                                }
                              />
                              <span>
                                {a.label}
                                <small>{brl(a.cents)}/mês</small>
                              </span>
                              {["slots", "domain"].includes(k) &&
                                !!specs.addons[k] && (
                                  <input
                                    aria-label={"Quantidade " + a.label}
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={specs.addons[k]}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      if (
                                        v >= 1 &&
                                        v <= 10 &&
                                        Number.isInteger(v)
                                      )
                                        change("addons", {
                                          ...specs.addons,
                                          [k]: v,
                                        });
                                    }}
                                  />
                                )}
                            </label>
                          ))}
                      </div>
                    </>
                  )}
                  {q.requiresVerification && (
                    <div className="warning">
                      <ShieldCheck size={18} />
                      <span>
                        Recursos de maior porte exigem identidade e pagamento
                        verificados. Sua conta:{" "}
                        {identity?.identityVerified && identity?.paymentVerified
                          ? "verificada"
                          : "pendente de revisão administrativa"}
                        .
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3>Confira antes de confirmar.</h3>
                  <div className="summary-list">
                    {[
                      ["Nome", name.trim() || "Meu novo serviço"],
                      ["Tecnologia", subtype],
                      ["Datacenter", specs.region],
                      [
                        "Recursos",
                        `${specs.ram} GB · ${specs.cpu} vCPU · ${specs.disk} GB`,
                      ],
                      ["Upload", upload?.filename || "Sem arquivo"],
                      [
                        "Cotação",
                        authoritative
                          ? "Validada pelo servidor"
                          : "Aguardando servidor",
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                  </div>
                  {runtime.production ? (
                    <p className="muted">
                      Pagamento seguro via Stripe. Seu serviço só será liberado
                      após a confirmação do pagamento e da infraestrutura.
                    </p>
                  ) : (
                    <>
                      <p className="warning">
                        Demonstração: nenhum pagamento ou serviço real.
                      </p>{" "}
                      <label>
                        Checkout
                        <select
                          value={paymentMode}
                          onChange={(e) => setPaymentMode(e.target.value)}
                        >
                          <option value="demo">
                            Simulação · sem cobrança real
                          </option>
                          <option value="stripe" disabled={!stripeReady}>
                            Stripe test mode{" "}
                            {stripeReady ? "" : "· não configurado"}
                          </option>
                        </select>
                      </label>
                    </>
                  )}
                  <label className="policy-check">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    <span>
                      Li e aceito os{" "}
                      <a href="/termos" target="_blank" rel="noopener">
                        Termos de Uso
                      </a>
                      , a{" "}
                      <a href="/privacidade" target="_blank" rel="noopener">
                        Política de Privacidade
                      </a>{" "}
                      e a{" "}
                      <a href="/reembolsos" target="_blank" rel="noopener">
                        Política de Reembolso e Cancelamento
                      </a>
                      . Não hospedarei conteúdo proibido. A renovação será
                      automática no ciclo informado, até ser cancelada.
                    </span>
                  </label>
                  <p className="muted">
                    {runtime.production
                      ? "O total acima corresponde à cobrança do ciclo. Revise recursos, região e renovação antes de continuar."
                      : "Nenhum recurso de infraestrutura real será criado nesta demonstração."}
                  </p>
                </>
              )}
              {step >= 4 && <PriceBreakdown value={q} />}{" "}
              {step < 4 && <PriceBreakdown value={q} compact />}
              {referralCode && (
                <p className="muted">
                  Indicação: {referralCode}{" "}
                  <button
                    className="text-button"
                    onClick={() => {
                      localStorage.removeItem("nexora-referral");
                      setError("");
                      setMargin(0);
                      setSpecs({ ...specs });
                    }}
                  >
                    Remover código
                  </button>
                </p>
              )}
            </div>
            <div className="wizard-footer">
              <button
                className="secondary"
                disabled={busy || uploading}
                onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
              >
                {step === 1 ? "Cancelar" : "Voltar"}
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  uploading ||
                  !!scanError ||
                  (step === 5 && (!accepted || !authoritative))
                }
                onClick={() => (step < 5 ? setStep(step + 1) : submit())}
              >
                {busy
                  ? "Registrando..."
                  : step === 5
                    ? paymentMode === "stripe"
                      ? runtime.production
                        ? "Ir ao pagamento seguro"
                        : "Ir ao Stripe de teste"
                      : "Criar demonstração"
                    : "Continuar"}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
