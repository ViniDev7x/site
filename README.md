# Nexora — versão essencial de lançamento

React/Vite + API Node.js 24 + SQLite em volume persistente. A versão de lançamento acrescenta autenticação real, confirmação e recuperação por e-mail, suporte humano, políticas legais, deploy com HTTPS, backup externo criptografado, monitoramento e um gate para impedir cobrança sem entrega real.

**Estado: preparação local concluída; lançamento comercial bloqueado por falta de contas/infraestrutura e dados legais completos. Nenhuma compra real nem deploy final foi confirmado.** O suporte público já usa o e-mail fornecido pelo operador. Documento pessoal, credenciais e bancos não são incluídos no pacote.

Passo a passo para iniciantes: [COMECE-AQUI.md](docs/COMECE-AQUI.md).

## Executar localmente

Instale Node.js 24 LTS, extraia o pacote e, na pasta com `package.json`, execute:

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. Frontend e API iniciam juntos. Este comando mantém o ambiente de demonstração separado de produção. Dados locais ficam em `.local/`. O cadastro real/produção não cria os três exemplos automaticamente. Para testar o caminho real de autenticação localmente, use o E2E isolado abaixo; não use e-mails ou cartões reais nele.

## Verificações

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test`: 31 testes, incluindo senhas/sessões, tokens de uso único, rate limiting, separação test/live, 404/500, backup SQLite criptografado/restaurável e fluxo Stripe/provisionador/e-mail **com fornecedores simulados**. `test:e2e` cria um servidor isolado, testa cadastro → confirmação de e-mail → login → checkout/provisionamento de desenvolvimento → painel, suporte simples, links legais e mobile. Capturas ficam em `test-results/`. Para Chromium do sistema, defina `CHROMIUM_EXECUTABLE`; não é preciso iniciar `npm run dev` antes desse E2E.

Os testes não confirmam DNS, Let's Encrypt, Railway, banco externo, e-mails entregues na internet ou uma compra live. O fluxo externo precisa ser concluído no ambiente final.

## Produção

Leia [o procedimento de lançamento](docs/LAUNCH.md). A recomendação é Railway para a aplicação; a alternativa é [Compose + Caddy](compose.production.yml) em uma VPS. O backend deve usar um volume em `/data`, uma única réplica e variáveis seguras baseadas em `.env.production.example`. Produção não carrega `.env` de teste; `npm start` usa apenas `.env.production` (se existir) e variáveis injetadas pelo provedor.

O provisionador precisa existir e cumprir [o contrato de integração](docs/PROVISIONER.md). Não há Docker/Wings de clientes conectado por padrão. A aplicação pública não recebe socket Docker nem executa código de clientes. API de healthcheck não equivale a “pronto para vender”.

- `PUBLIC_CHECKOUT_ENABLED=false` mantém a compra live restrita ao titular configurado, com todos os pré-requisitos verificados.
- `PUBLIC_CHECKOUT_ENABLED=true` só abre vendas depois de compra live, serviço realmente pronto e três e-mails entregues comprovados no banco.
- Chaves test são recusadas em produção; chaves live são recusadas no modo de demonstração.
- Se faltar backup, TLS, gateway habilitado, e-mail ou provisionador real, o checkout pago não cobra. O Free dispensa gateway, mas exige os demais pré-requisitos e políticas específicas no provisionador.

## Planos Free e pagos

Free (4 GB), Starter (6 GB), Plus (10 GB), Pro (16 GB) e Elite (32–64 GB) foram integrados ao wizard e à API. Free não exige cartão nem Checkout Stripe; usa resgate único por identidade e renovação manual em sete dias. Cupons possuem reservas/limites e administração; upgrade amplia o serviço existente após pagamento, preservando dados. Leia [PLANOS-E-CUPONS.md](docs/PLANOS-E-CUPONS.md) para regras, dependências reais, preços e testes. Novos contratos do provisionador precisam ser implementados antes de oferecer Free/upgrade em produção.

## Escopo do dia 1

Incluído: preços e resumo, cadastro/login/verificação/recuperação/logout, pedidos idempotentes, webhooks assinados, worker persistente, adaptador de infraestrutura real, e-mails com outbox criptografada, faturamento/cancelamento de renovação, suporte por e-mail, 404/500 próprias, favicon/metadados, aviso de beta, Termos/Privacidade LGPD/Reembolso e aceite versionado.

Afiliados, revenda, marketplace, IA, uploads, gerenciamento de arquivos e add-ons avançados estão fora da UI de lançamento; seus endpoints são bloqueados em produção. O código histórico demonstrativo permanece para uma futura iteração e testes de regressão. Não confunda perfis de isolamento planejados com infraestrutura real configurada.

A configuração do domínio, a emissão de certificado, a ativação de Stripe/Resend/S3 e a compra live exigem acesso e contas do operador. Não envie segredos no chat. Preencha a identidade legal real antes de publicar; as páginas são templates operacionais que precisam refletir a oferta e os fornecedores efetivamente contratados.
