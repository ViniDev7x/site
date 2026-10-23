# Lançamento — estado e procedimento

## Estado real desta entrega

Código, configuração de container e testes locais preparados. **Não há deploy final, domínio próprio, certificado público, conta Stripe live, provedor de e-mail, bucket de backup ou provisionador real configurados neste ambiente. Nenhuma compra real foi efetuada e nenhuma entrega externa de e-mail foi confirmada.**

O operador informou o contato público `vinitudotwo@gmail.com` e o usuário Discord `vnpsyco`. Esse usuário não é um link de convite. O documento de identificação informado não foi copiado para o repositório/ZIP; cadastre-o somente em `OPERATOR_TAX_ID` no ambiente final. O responsável é Vinicius Antunes e Silva; a localização informada foi São Paulo. Falta completar a localidade/referência real para identificação e correspondência, sem inventar rua ou número. A configuração de produção rejeita dados legais incompletos e CPF/CNPJ inconsistente.

Sem gateway e infraestrutura não existe serviço real a ser vendido. Não habilite live em demonstração nem marque uma API fictícia como provisionador. Afiliados, marketplace, uploads, revenda e IA avançada ficam fora do lançamento.

## Caminho recomendado: Railway para a aplicação

1. Crie a conta/projeto em https://railway.com/ e conecte **este código atualizado**. Use a branch `main` atualizada de `ViniDev7x/site`; o envio ao GitHub não efetua o deploy. Railway usa `Dockerfile` e `railway.json`.
2. Crie um volume persistente montado em `/data`, uma única réplica e limite de pelo menos 1 GB de RAM. O banco SQLite/WAL não deve ficar no filesystem efêmero. Este release não suporta múltiplas instâncias simultâneas da API.
3. Cadastre as variáveis de `.env.production.example` nos campos seguros do Railway. Nunca use `.env` de desenvolvimento nem cole chaves no chat. Preencha a identificação legal real. Gere cada segredo de aplicação, backup e administração separadamente, por exemplo com `openssl rand -hex 32`, e guarde-os fora do código.
4. Gere o domínio padrão do Railway. Ele fornece HTTPS gerenciado; use-o como `APP_ORIGIN` inicial. O endereço exato só existe após criar o serviço e não pode ser inventado nesta tarefa.
5. Para domínio próprio, registre um nome escolhido pelo operador e adicione-o em Networking/Custom Domain. No provedor DNS, crie exatamente o CNAME/ALIAS e a verificação indicados pelo Railway. Não adivinhe IPs ou remova registros existentes sem verificar sua função. Aguarde DNS e certificado válidos. Depois atualize `APP_ORIGIN` e os webhooks.
6. O healthcheck `/api/health` prova que o processo e o banco respondem. `/api/ready` e a tela Operação mostram os pré-requisitos. **Um deploy verde não prova prontidão comercial.**

O Railway hospeda a plataforma; isso **não fornece automaticamente** servidores de jogos, containers de bots e sites de clientes. Contrate/configure separadamente o provisionador, por exemplo um painel Wings/Pterodactyl gerenciado, e adapte o contrato de `PROVISIONER.md`.

## Alternativa VPS com HTTPS automático

Requer VPS com Docker Compose, IP público e portas 80/443 abertas. Preencha `.env.production`, defina `APP_DOMAIN` e `TLS_CONTACT_EMAIL`, e configure A/AAAA no DNS. Só publique AAAA se o IPv6 realmente atender o serviço. Execute:

```sh
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

Caddy obtém e renova o certificado ACME e redireciona HTTP para HTTPS. Volumes `caddy_data` e `platform_data` devem persistir. Apenas Caddy publica portas; a API usa rede interna e confia exclusivamente no IP fixo do proxy. Não publique 3000/3001 diretamente. Verifique se a subnet configurada não conflita com a rede existente antes de usar o Compose. O compose deste pacote não executa workloads de clientes.

## E-mail transacional

Crie conta no Resend, verifique um **domínio de envio próprio** e publique SPF/DKIM conforme as instruções do fornecedor; configure DMARC. Gmail pode ser o destino do suporte, mas não pode ser usado como remetente próprio do Resend. `onboarding@resend.dev` não libera checkout de produção.

Defina `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` e `MAIL_FROM`. Cadastre `/api/mail/webhook` para `email.delivered`, `email.bounced`, `email.failed`, `email.complained`. A assinatura Svix é validada pelo SDK; envio usa outbox criptografada, retentativas e idempotência. Tokens de verificação são de uso único e expiram em uma hora.

`accepted` significa aceitação pelo provedor. `delivered` exige webhook assinado. Confirme manualmente caixa de entrada/spam do usuário de teste. Falhas ficam visíveis em Operação. Se o evento chegar antes da resposta da API de envio, ele é conciliado depois. Boas-vindas são enviadas após confirmar o endereço; recibo só após pagamento confirmado; “serviço pronto” só após readiness real do provisionador.

## Backup da plataforma (não dos clientes)

Crie um bucket S3/compatível externo à VPS, privado, com criptografia do armazenamento e bloqueio de acesso público. Forneça credencial restrita a esse bucket/prefixo (PutObject, GetObject/HeadObject e permissões necessárias ao cliente), região/endpoint e `BACKUP_ENCRYPTION_KEY`. Não use um segredo de proxy que vire placeholder como chave de criptografia local: a aplicação precisa dos bytes reais na variável segura do ambiente final.

O processo faz backup online consistente do SQLite, criptografa com AES-256-GCM, restaura em arquivo temporário e executa `integrity_check` antes de enviar. Verifica tamanho/checksum remoto. Executa no início e a cada 24 horas; falha ou backup com mais de 26 horas bloqueia novas compras e deve disparar alerta de readiness. O objetivo inicial é RPO de até 24 horas; restauração precisa ser ensaiada no ambiente final.

Aplique/revise uma política de retenção no bucket (exemplo: `deploy/backup-lifecycle.json`, 30 dias). A aplicação não inventa/aplica uma política em um bucket desconhecido nem cria automaticamente uma conta de armazenamento. Proteja e guarde a chave: sem ela não há restauração. Banco e backups contêm dados pessoais, sessões e faturas; limite acesso.

Para restaurar uma cópia baixada do bucket:

```sh
npm run backup:restore -- backup.sqlite.enc /caminho/novo-nexora.sqlite
```

O script valida integridade e recusa sobrescrever destino existente. Pare a plataforma, preserve banco anterior **e arquivos WAL/SHM**, valide a cópia restaurada e faça a troca de forma controlada. Nunca apague um WAL de banco em uso. O ensaio local automatizado usa S3 simulado e não confirma armazenamento externo.

## Stripe live e compra controlada

1. Ative sua conta Stripe, conclua verificação do negócio/conta bancária e configure e-mails do Stripe para cobranças recorrentes e falhas. A aplicação exige conta com cobranças e recebimentos habilitados.
2. Defina `STRIPE_SECRET_KEY` **live** e segredo do endpoint live `/api/billing/webhook`. Eventos: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`; configure também eventos de estorno/disputa usados pela operação. Não misture endpoints/secrets test/live.
3. Mantenha `PUBLIC_CHECKOUT_ENABLED=false` e `LAUNCH_TEST_EMAIL=vinitudotwo@gmail.com`. A conta desse endereço deve se cadastrar, confirmar e-mail e entrar. Apenas ela poderá realizar a primeira compra, depois de domínio/TLS, Stripe, e-mail, backup e provisionador passarem no preflight.
4. Na tela Operação, autentique com a conta da lista `ADMIN_EMAILS` e o token administrativo. Confira todos os pré-requisitos. Não force flags ou use mocks para contornar verificações.
5. O próprio titular deve concluir uma compra real de valor conhecido no Checkout, com um plano que o nó consiga entregar. Confira o débito, a fatura live no Stripe, o webhook, o job e o serviço utilizável pelo endereço entregue. **Não basta receber o redirecionamento de sucesso.**
6. Confira os três e-mails (boas-vindas, recibo e pronto) na caixa de entrada e seus estados `delivered`. Teste sair/entrar e acessar o serviço da conta correta. Confira também a política e o procedimento de cancelamento/estorno.
7. Só então altere `PUBLIC_CHECKOUT_ENABLED=true` e reinicie. O código ainda exige a prova persistida de compra live + serviço não demonstrativo + três entregas de e-mail; uma variável sozinha não abre vendas.

Não usamos dados de cartão no backend. A conta Stripe precisa tratar fraude/SCA e cobrança recorrente conforme as capacidades do gateway. “Cancelar renovação” usa `cancel_at_period_end`; ao receber subscription.deleted, o serviço é parado no provisionador. Reembolsos e falhas de entrega exigem atendimento humano e ação no Stripe; monitore esses casos antes de divulgar.

## Monitoramento externo e alerta

O workflow `.github/workflows/uptime.yml` acompanha o código no GitHub, mas **a verificação fica desativada enquanto `PUBLIC_URL` não estiver configurada**. Nas configurações do repositório, cadastre variável `PUBLIC_URL` (origem HTTPS) e segredo `UPTIME_ALERT_WEBHOOK` (por exemplo webhook privado de canal Discord). O nome de usuário `vnpsyco` não fornece um webhook.

O workflow usa checkout fixado por commit, verifica `/`, `/api/health`, `/api/ready` aproximadamente a cada 5 minutos e envia alerta nas falhas. Confirme o alerta real com indisponibilidade controlada e restaure o serviço. Agendamentos do GitHub podem atrasar; para exigência maior, use um monitor dedicado. Nunca rode somente um monitor na própria VPS: ele não detectaria a queda da máquina inteira. O script falha com status diferente de zero se o alerta não for entregue.

## Checklist final — não assinalado automaticamente

- [ ] Dados legais reais preenchidos e conferidos.
- [ ] Domínio e certificado válidos no ambiente final; `APP_ORIGIN` correto.
- [ ] Volume e banco de produção separados dos exemplos de desenvolvimento.
- [ ] Cadastro, confirmação, login, recuperação e logout manuais.
- [ ] E-mail de suporte público acessível e respondido pela equipe.
- [ ] Backup externo e ensaio de restauração no ambiente final.
- [ ] Provisionador real com isolamento e serviço utilizável; nada de API mock.
- [ ] Primeira compra live do titular, fatura, três e-mails e painel testados.
- [ ] Cancelamento e reembolso ensaiados; alertas operacionais recebidos.
- [ ] Monitor externo e alerta de queda testados.
- [ ] Só depois: abrir checkout público e divulgar.
