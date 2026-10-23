import React, { useEffect, useState } from "react";
import {
  Check,
  ArrowRight,
  X,
  Sparkles,
  BookOpen,
  RotateCcw,
} from "lucide-react";
import { api } from "./api.js";
const steps = [
  {
    id: "domain",
    title: "Configurar domínio ou IP",
    description:
      "Abra Configurações e confira o endereço do serviço antes de configurar seu DNS.",
    tab: "Configurações",
  },
  {
    id: "connection",
    title: "Testar conexão",
    description:
      "Abra o Console para conferir a inicialização. O console atual usa dados demonstrativos.",
    tab: "Console",
  },
  {
    id: "backup",
    title: "Configurar backup",
    description:
      "Revise a retenção na aba Backups. Neste ambiente a restauração é simulada.",
    tab: "Backups",
  },
  {
    id: "collaborators",
    title: "Convidar colaboradores",
    description:
      "Registre os convites em Configurações. O envio e a liberação de acesso aguardam integração de e-mail e autenticação.",
    tab: "Configurações",
  },
];
const guides = {
  Jogos: {
    title: "Conecte seu servidor de jogo",
    body: "Use o endereço do serviço no cliente do jogo. Em produção, libere a porta do jogo no firewall e confira a versão/engine antes de instalar plugins. Faça backup antes de mudar modpacks.",
  },
  "Bots Discord": {
    title: "Publique seu bot Discord",
    body: "Em produção, configure o token em um cofre de segredos, selecione a versão Node.js/Python e revise os intents no Developer Portal. Nunca envie seu token no chat ou dentro de um ZIP. Aprove o scan antes do deploy.",
  },
  Sites: {
    title: "Publique seu site",
    body: "Em produção, conecte o Git, revise o comando de build e a porta HTTP. Aponte o DNS para o servidor e valide o domínio antes de emitir SSL. Bancos de dados e segredos devem ficar restritos ao serviço.",
  },
};
export default function Onboarding({ service, onChange, setTab }) {
  const [tour, setTour] = useState(
      service.onboarding?.tourSeen === false ? 0 : null,
    ),
    [error, setError] = useState(""),
    [guide, setGuide] = useState(
      new URLSearchParams(location.search).has("guide"),
    ),
    [position, setPosition] = useState(null);
  const completed = service.onboarding?.steps || {};
  const count = Object.values(completed).filter(Boolean).length;
  useEffect(() => {
    setTour(service.onboarding?.tourSeen === false ? 0 : null);
    setGuide(new URLSearchParams(location.search).has("guide"));
  }, [service.id]);
  useEffect(() => {
    if (tour === null) return;
    const update = () => {
      const el = document.querySelector(`[data-tour="${steps[tour].id}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPosition({
        top: Math.min(Math.max(r.bottom + 10, 90), window.innerHeight - 230),
        left: Math.min(Math.max(r.left, 14), window.innerWidth - 334),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [tour]);
  async function update(body) {
    setError("");
    try {
      const next = await api(`/services/${service.id}/onboarding`, {
        method: "PATCH",
        body,
      });
      onChange(next);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }
  async function finish() {
    if (await update({ tourSeen: true })) setTour(null);
  }
  return (
    <>
      <section className="panel onboarding-panel">
        <div className="panel-title">
          <div>
            <h3>
              <Sparkles size={17} />
              Seu serviço está pronto. E agora?
            </h3>
            <p>
              Checklist manual de preparação · {count} de 4 etapas concluídas
            </p>
          </div>
          <button className="text-button" onClick={() => setTour(0)}>
            <RotateCcw size={13} />
            Rever tour
          </button>
        </div>
        <div className="onboarding-list">
          {steps.map((s, i) => (
            <div
              key={s.id}
              data-tour={s.id}
              className={
                "checklist-step " +
                (completed[s.id] ? "done " : "") +
                (tour === i ? "tour-highlight" : "")
              }
            >
              <button
                className="check-toggle"
                aria-label={
                  (completed[s.id] ? "Desmarcar " : "Concluir ") + s.title
                }
                onClick={() => update({ step: s.id, done: !completed[s.id] })}
              >
                {completed[s.id] ? <Check size={14} /> : i + 1}
              </button>
              <button
                className="checklist-link"
                onClick={() => {
                  setTab(s.tab);
                  if (tour !== null) setTour(i);
                }}
              >
                <b>{s.title}</b>
                <small>
                  {completed[s.id] ? "Confirmado por você" : "Abrir " + s.tab}
                </small>
              </button>
              <ArrowRight size={14} />
            </div>
          ))}
        </div>
        <div className="onboarding-guide">
          <span>
            As etapas registram sua confirmação; não validam operações em
            servidores reais.
          </span>
          <button className="text-button" onClick={() => setGuide(!guide)}>
            <BookOpen size={14} />
            Guia de {service.category}
            <ArrowRight size={13} />
          </button>
          <a
            className="text-button direct-guide"
            href={`?service=${encodeURIComponent(service.id)}&guide=1#service-guide`}
          >
            Link direto do guia ↗
          </a>
        </div>
        {guide && (
          <article className="specific-guide" id="service-guide">
            <h3>{guides[service.category].title}</h3>
            <p>{guides[service.category].body}</p>
            <p className="muted">
              Este serviço é demonstrativo. Endereço .invalid não é acessível
              pela internet.
            </p>
          </article>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
      {tour !== null && (
        <>
          <div className="tour-backdrop" />
          <div
            className="tour-popover"
            role="dialog"
            aria-label="Tour do serviço"
            style={position || { top: 150, left: 20 }}
          >
            <button
              className="tour-close icon-button"
              aria-label="Fechar tour"
              onClick={finish}
            >
              <X size={16} />
            </button>
            <span className="eyebrow">PRIMEIROS PASSOS · {tour + 1}/4</span>
            <h3>{steps[tour].title}</h3>
            <p>{steps[tour].description}</p>
            <div className="actions">
              <button className="text-button" onClick={finish}>
                Pular tour
              </button>
              <button
                className="primary"
                onClick={() => (tour === 3 ? finish() : setTour(tour + 1))}
              >
                {tour === 3 ? "Começar a usar" : "Próximo"}
                <ArrowRight size={13} />
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        </>
      )}
    </>
  );
}
