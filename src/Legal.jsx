import React from "react";
export function LegalFooter({ config }) {
  return (
    <footer className="legal-footer">
      <span>Nexora · Acesso antecipado</span>
      <nav>
        <a href="/termos">Termos de Uso</a>
        <a href="/privacidade">Privacidade e LGPD</a>
        <a href="/reembolsos">Reembolso e cancelamento</a>
        {config.supportEmail ? (
          <a href={`mailto:${config.supportEmail}`}>
            Suporte: {config.supportEmail}
          </a>
        ) : (
          <span>Contato de suporte ainda não configurado</span>
        )}
        {config.discord && (
          <a href={config.discord} target="_blank" rel="noopener noreferrer">
            Discord de suporte ↗
          </a>
        )}
      </nav>
    </footer>
  );
}
export function SupportContact({ config }) {
  return (
    <section className="panel simple-support">
      <h2>Fale com a equipe.</h2>
      <p>
        No lançamento, o atendimento é direto com pessoas. Inclua o nome do
        serviço e uma descrição do problema; nunca envie senhas, tokens ou dados
        completos do cartão.
      </p>
      {config.supportEmail ? (
        <a
          className="primary"
          href={`mailto:${config.supportEmail}?subject=Suporte%20Nexora`}
        >
          Enviar e-mail ao suporte
        </a>
      ) : (
        <p className="warning">
          O operador ainda precisa configurar o e-mail de suporte antes do
          lançamento.
        </p>
      )}
      {config.discord && (
        <a
          className="secondary"
          href={config.discord}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir Discord de suporte ↗
        </a>
      )}
      {config.discordUser&&!config.discord&&<p className="muted">Usuário Discord: <b>{config.discordUser}</b>. Para abrir o servidor de suporte, aguarde um convite oficial da equipe.</p>}
      <p className="muted">
        Solicitações de cancelamento, reembolso e direitos de privacidade também
        podem ser feitas por e-mail. Não há assistente de IA nesta versão.
      </p>
    </section>
  );
}
export function LegalPage({ config, type }) {
  const operator = config.operator || "[Responsável ainda não configurado]",
    contact = config.supportEmail || "[suporte ainda não configurado]",
    privacy = config.privacyEmail || contact;
  const titles = {
    termos: "Termos de Uso",
    privacidade: "Política de Privacidade e LGPD",
    reembolsos: "Política de Reembolso e Cancelamento",
  };
  return (
    <div className="public-shell">
      <a className="public-brand" href="/">
        ◈ nexora
      </a>
      <article className="panel legal-copy">
        <span className="tag">Versão {config.legalVersion} · Beta</span>
        <h1>{titles[type]}</h1>
        <p>
          Operador: {operator}. CPF/CNPJ: {config.taxId || "[a configurar]"}.
          Endereço: {config.address || "[a configurar]"}. Contato: {contact}.
        </p>
        {type === "termos" ? (
          <>
            <h2>1. Contratação e escopo do serviço</h2>
            <p>
              A Nexora oferece hospedagem de jogos, bots Discord e sites
              conforme a categoria, tecnologia, região e recursos expressamente
              disponíveis no checkout. O preço do ciclo, a periodicidade, os
              recursos e o valor de renovação são apresentados antes de pagar.
              Funcionalidades marcadas como indisponíveis não integram a oferta.
              O recibo do gateway não substitui documento fiscal quando exigido.
            </p>
            <h2>2. Acesso antecipado</h2>
            <p>
              A plataforma está em beta. Podem ocorrer ajustes e manutenções
              comunicados pelos canais de suporte. Esse aviso não afasta
              direitos do consumidor nem autoriza cobrar por um serviço não
              entregue. Não prometemos SLA ou proteção de infraestrutura além do
              que estiver expressamente contratado.
            </p>
            <h2>3. Conta e responsabilidades</h2>
            <p>
              Use dados verdadeiros, confirme seu e-mail, mantenha sua senha em
              sigilo e proteja tokens e arquivos. Você precisa ter capacidade
              civil para contratar ou representação válida. O conteúdo
              hospedado, as licenças de softwares/modpacks e a observância dos
              termos dos jogos e do Discord são de sua responsabilidade.
            </p>
            <h2>4. Conteúdo e atividades proibidas</h2>
            <p>
              É proibido hospedar ou distribuir conteúdo ilegal; malware,
              phishing ou ferramentas utilizadas para fraude; conteúdo que viole
              direitos autorais, privacidade ou direitos de terceiros; realizar
              ataques a terceiros, botnets, spam, scraping abusivo ou acesso não
              autorizado; contornar limites ou medidas de segurança. Mineração
              de criptomoedas, proxy aberto e revenda não contratada não são
              permitidos. Conteúdo que envolva exploração sexual de menores é
              proibido e será tratado conforme a legislação.
            </p>
            <h2>5. Suspensão e revisão</h2>
            <p>
              Podemos restringir ou suspender serviços diante de evidência de
              abuso, risco imediato à infraestrutura, inadimplência ou obrigação
              legal. A conta será notificada com o motivo que puder ser
              divulgado. Solicite revisão pelo suporte. Medidas urgentes não
              eliminam os direitos de contestação e de reembolso aplicáveis.
            </p>
            <h2>6. Pagamentos e renovação</h2>
            <p>
              O checkout é processado pelo Stripe em ambiente seguro. Não
              armazenamos o número completo do cartão nem seu código de
              segurança. Assinaturas renovam pelo ciclo escolhido, salvo
              cancelamento. Cancele a renovação pelo painel de faturamento antes
              da próxima cobrança ou solicite auxílio pelo suporte. Não
              alteramos o preço do pedido já confirmado sem informar e obter o
              consentimento exigível.
            </p>
            <h2>7. Disponibilidade, dados e backups</h2>
            <p>
              O operador mantém backup do banco da plataforma para recuperação
              de contas, faturas e serviços. Isso não equivale a backup do
              conteúdo hospedado. A política de backup de cada serviço do
              cliente só se aplica quando expressamente oferecida. Mantenha
              cópias dos seus arquivos e consulte o suporte antes de alterações
              destrutivas.
            </p>
            <h2>8. Cancelamento, legislação e contato</h2>
            <p>
              Aplicam-se a Política de Reembolso, a legislação brasileira, o
              Código de Defesa do Consumidor quando cabível, a LGPD e as regras
              de competência que protegem o consumidor. Nenhuma cláusula limita
              direitos legalmente irrenunciáveis. Alterações materiais serão
              comunicadas. Dúvidas e solicitações: {contact}.
            </p>
          </>
        ) : type === "privacidade" ? (
          <>
            <h2>1. Controlador e contato de privacidade</h2>
            <p>
              {operator} é responsável pelas decisões sobre os dados pessoais da
              plataforma. Para solicitações de privacidade, fale com {privacy}.
              Poderemos pedir somente as informações necessárias para confirmar
              sua identidade, sem solicitar senha ou cartão completo.
            </p>
            <h2>2. Dados tratados</h2>
            <p>
              Tratamos nome, e-mail, confirmação de e-mail, hash e salt de
              senha, sessões, registros de contratação e aceite, identificadores
              de pagamento, plano, faturas, dados técnicos do serviço e contatos
              de suporte. Registros de acesso incluem IP, data/hora, rota e
              resultado da requisição; não incluem senha, cookies ou tokens de
              verificação. A plataforma não coleta dados biométricos ou cópias
              de documentos neste fluxo.
            </p>
            <h2>3. Finalidades e bases legais</h2>
            <p>
              Cadastro, autenticação, provisionamento, cobrança e comunicações
              necessárias usam execução de contrato e procedimentos
              preliminares. Registros fiscais e de acesso atendem obrigações
              legais quando aplicáveis. Segurança, prevenção de fraude e
              recuperação usam legítimo interesse, com medidas proporcionais.
              Comunicações comerciais opcionais somente ocorrerão com base legal
              própria; não enviamos marketing por padrão nem usamos cookies de
              publicidade nesta versão.
            </p>
            <h2>4. Compartilhamento e transferências internacionais</h2>
            <p>
              Compartilhamos apenas o necessário com processadores de pagamento
              (Stripe), provedor de e-mail transacional (Resend),
              hospedagem/provisionamento e armazenamento de backups contratados
              pelo operador. Autoridades podem receber dados nos casos previstos
              em lei. Alguns fornecedores podem tratar dados fora do Brasil; o
              operador deve adotar as salvaguardas e instrumentos contratuais
              exigidos pela LGPD e pela ANPD. Não vendemos dados pessoais.
            </p>
            <h2>5. Segurança, cookies e retenção</h2>
            <p>
              Usamos HTTPS, senhas derivadas com salt, sessões HttpOnly,
              verificação de e-mail, controles de autorização, limites de
              requisições e backups criptografados. Cookies de sessão são
              necessários para o painel. Dados permanecem pelo tempo necessário
              à prestação e às obrigações legais; registros de acesso são
              retidos por até 6 meses quando exigíveis, e registros
              fiscais/contábeis seguem os prazos legais aplicáveis. Tokens de
              acesso expiram, sessões podem ser revogadas e cópias de segurança
              seguem a retenção do armazenamento externo. Nenhum sistema é imune
              a incidentes.
            </p>
            <h2>6. Seus direitos</h2>
            <p>
              Você pode solicitar confirmação de tratamento, acesso, correção,
              informações sobre compartilhamento,
              anonimização/bloqueio/eliminação quando cabíveis, portabilidade
              nos termos da regulamentação, revisão de decisões automatizadas e
              revogação de consentimento. A eliminação pode ser limitada por
              obrigação legal, exercício regular de direitos e outras hipóteses
              da LGPD. Responderemos nos prazos legais, inclusive com declaração
              completa em até 15 dias quando aplicável ao direito de acesso.
            </p>
            <h2>7. Incidentes e atualizações</h2>
            <p>
              Incidentes com risco ou dano relevante serão avaliados e
              comunicados à ANPD e aos titulares nos prazos e condições da
              regulamentação aplicável. Atualizações materiais desta política
              serão informadas. Solicitações e reclamações podem ser
              encaminhadas ao contato de privacidade e à ANPD, sem prejuízo de
              outros direitos.
            </p>
          </>
        ) : (
          <>
            <h2>1. Cancelar a renovação</h2>
            <p>
              No painel, abra Faturamento e escolha Cancelar renovação no plano
              desejado. O serviço segue disponível até o fim do período pago,
              salvo motivo legal ou de segurança. O cancelamento da renovação
              não é automaticamente uma solicitação de reembolso; você pode
              fazer ambos pelo suporte. Após o encerramento, solicite orientação
              sobre exportação e remoção dos arquivos.
            </p>
            <h2>2. Direito de arrependimento</h2>
            <p>
              Quando a contratação à distância estiver sujeita ao Código de
              Defesa do Consumidor, você pode exercer o direito de
              arrependimento no prazo legal de 7 dias, contado conforme a
              legislação, com devolução dos valores devidos. O início do uso do
              serviço não representa renúncia automática a esse direito. Esta
              política não exclui outros direitos legais.
            </p>
            <h2>3. Falha de entrega ou serviço</h2>
            <p>
              Se o serviço pago não for entregue, contate o suporte para
              correção ou restituição cabível. Problemas de qualidade ou
              desconformidade serão tratados nos termos da legislação. Não
              solicitaremos novo pagamento para corrigir uma falha de
              provisionamento do mesmo pedido.
            </p>
            <h2>4. Como solicitar</h2>
            <p>
              Envie a solicitação a {contact}, usando o e-mail da conta, com
              nome do serviço e referência da cobrança. Não envie senha ou
              cartão completo. Confirmaremos o recebimento e a análise pelos
              canais informados. O reembolso aprovado será solicitado ao gateway
              para o meio de pagamento original; o prazo de processamento final
              depende da instituição financeira e não afasta os prazos legais.
            </p>
            <h2>5. Situações especiais e atendimento</h2>
            <p>
              Solicitações fora do direito de arrependimento serão avaliadas
              conforme os fatos, o contrato e a lei. Suspeitas de fraude ou uso
              proibido não autorizam retenção arbitrária de valores nem renúncia
              a direitos irrenunciáveis. Você pode contestar decisões pelo
              suporte e recorrer aos órgãos competentes.
            </p>
          </>
        )}
      </article>
      <LegalFooter config={config} />
    </div>
  );
}
