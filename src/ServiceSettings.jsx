import React, { useEffect, useState } from "react";
import { Globe, Users, Download, Plus } from "lucide-react";
import { api, post } from "./api.js";
import { TABLE, brl } from "../shared/pricing.js";
export default function ServiceSettings({ service, onChange, notify }) {
  const [address, setAddress] = useState(service.customAddress || ""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("viewer"),
    [invitations, setInvitations] = useState([]),
    [licenses, setLicenses] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [addons, setAddons] = useState(service.quote.specs.addons),
    [preview, setPreview] = useState(null),
    [requestId, setRequestId] = useState(crypto.randomUUID());
  useEffect(() => {
    Promise.all([api(`/services/${service.id}/invitations`), api("/licenses")])
      .then(([i, l]) => {
        setInvitations(i);
        setLicenses(l);
      })
      .catch((e) => setError(e.message));
  }, [service.id]);
  async function run(fn) {
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
  return (
    <div className="settings-form">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const next = await api(`/services/${service.id}/setup`, {
              method: "PATCH",
              body: { address },
            });
            onChange(next);
            notify(
              "Endereço salvo. Aplicação DNS/SSL pendente de infraestrutura real.",
            );
          });
        }}
      >
        <h3>
          <Globe size={17} />
          Domínio ou IP
        </h3>
        <p>
          Endereço interno: {service.address} · {service.quote.specs.region}
        </p>
        <label>
          Endereço personalizado
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="jogar.minhacomunidade.com"
          />
        </label>
        <button className="secondary" disabled={busy}>
          Salvar endereço
        </button>
        <p className="muted">
          Salvar registra sua configuração. DNS, portas e SSL não são aplicados
          pelo provisionador de demonstração.
        </p>
      </form>
      <form
        className="service-settings-section"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await post(`/services/${service.id}/invitations`, { email, role });
            setInvitations(await api(`/services/${service.id}/invitations`));
            setEmail("");
            notify(
              "Convite registrado. Envio de e-mail e acesso aguardam integração de autenticação.",
            );
          });
        }}
      >
        <h3>
          <Users size={17} />
          Colaboradores
        </h3>
        <div className="form-grid">
          <label>
            E-mail do colaborador
            <input
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@comunidade.com"
            />
          </label>
          <label>
            Permissão
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="viewer">Visualização</option>
              <option value="operator">Operação</option>
            </select>
          </label>
        </div>
        <button className="secondary" disabled={busy}>
          Registrar convite
        </button>
        {invitations.map((i) => (
          <div className="file-row" key={i.id}>
            <Users size={15} />
            <b>{i.email}</b>
            <span>{i.role} · pendente de envio e autenticação</span>
          </div>
        ))}
      </form>
      <section className="service-settings-section">
        <h3>
          <Plus size={17} />
          Contratar adicionais
        </h3>
        <p>
          Escolha novos adicionais. A cobrança é por um ciclo completo, sem
          pró-rata, e só ocorre após confirmar. Fluxo disponível em
          demonstração.
        </p>
        <div className="addon-options">
          {Object.entries(TABLE.addons)
            .filter(([, a]) => a.categories.includes(service.category))
            .map(([key, a]) => (
              <label className="policy-check addon-option" key={key}>
                <input
                  type="checkbox"
                  disabled={!!service.quote.specs.addons[key]}
                  checked={!!addons[key]}
                  onChange={(e) => {
                    setAddons({ ...addons, [key]: e.target.checked ? 1 : 0 });
                    setPreview(null);
                    setRequestId(crypto.randomUUID());
                  }}
                />
                <span>
                  {a.label}
                  <small>
                    {brl(a.cents)}/mês{" "}
                    {service.quote.specs.addons[key] ? "· já contratado" : ""}
                  </small>
                </span>
              </label>
            ))}
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setPreview(
                await post(`/services/${service.id}/addons`, { addons }),
              ),
            )
          }
        >
          Calcular adicional
        </button>
        {preview && (
          <div className="price-breakdown">
            <div className="price-row">
              <span>Adicional agora · ciclo completo</span>
              <b>{brl(preview.chargeCents)}</b>
            </div>
            <div className="price-row">
              <span>Nova renovação total por ciclo</span>
              <b>{brl(preview.quote.renewal)}</b>
            </div>
            <p className="muted">
              Os descontos do ciclo também se aplicam ao adicional. Nenhuma
              cobrança real será realizada.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await post(`/services/${service.id}/addons`, {
                    addons,
                    confirm: true,
                    paymentMode: "demo",
                    requestId,
                    expectedCharge: preview.chargeCents,
                    previousTotal: preview.previousTotal,
                  });
                  onChange(result.service);
                  setPreview(null);
                  notify(
                    "Adicional confirmado em demonstração. Fatura registrada.",
                  );
                })
              }
            >
              Confirmar adicional · {brl(preview.chargeCents)}
            </button>
          </div>
        )}
      </section>
      {licenses
        .filter((l) => l.template === service.template)
        .map((l) => (
          <div className="file-row" key={l.id}>
            <Download size={17} />
            <b>{l.product.title}</b>
            <a
              className="secondary"
              href={`/api/licenses/${l.id}/download`}
              download
            >
              Baixar template ZIP
            </a>
          </div>
        ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
