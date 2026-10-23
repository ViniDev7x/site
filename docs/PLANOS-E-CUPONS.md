# Planos, Free, cupons e upgrade

| Plano | RAM | vCPU | Disco | Slots de jogos |
|---|---:|---:|---:|---:|
| Free | 4 GB | 2 | 40 GB | 5 |
| Starter | 6 GB | 3 | 60 GB | 20 |
| Plus | 10 GB | 5 | 100 GB | 40 |
| Pro | 16 GB | 8 | 160 GB | 80 |
| Elite | 32–64 GB | 16–32 | 320–640 GB | 160 |

A tabela está em `shared/plans.js`. Elite usa `ceil(RAM/2)` vCPU e `RAM × 10` GB de disco. O slider aumenta os três recursos juntos. Os demais presets são fixos. Os preços pagos continuam usando o motor de recursos, região, categoria e desconto de ciclo já existente; a oferta Free resulta em zero centavos, independentemente da região. Serviços antigos e chamadas legadas sem plano explícito conservam sua precificação anterior.

## Começar sem comprar

No wizard, selecione Free (padrão), aceite as políticas e informe CPF. Em demonstração anônima informe também um e-mail; em produção o e-mail deve pertencer à conta e estar confirmado. O Free não cria Checkout Stripe, assinatura paga, fatura ou recibo de pagamento. O worker cria o serviço e, em produção, envia o aviso de serviço pronto após a confirmação real.

A identidade é reservada na mesma transação que grava o pedido e o job. Conta, CPF e e-mail não podem resgatar outro benefício; o bloqueio também vale durante provisionamento, depois de hibernação e depois de upgrade. A política é **um resgate de benefício por identidade**, mais restritiva do que apenas um serviço Free simultâneo. Não exclua `freeClaims` ao fazer upgrade, pois isso permitiria resgates repetidos. Um resgate com falha exige revisão do suporte; a reserva não é apagada automaticamente.

CPF é validado matematicamente e comparado por HMAC; não é salvo em texto puro nos pedidos, notificações ou registros de benefício. Isso não verifica a titularidade do documento em órgão oficial. E-mails Gmail normalizam pontos e alias `+`; outros provedores são normalizados apenas por caixa e espaços. Identificadores continuam sendo dados pessoais pseudonimizados. A chave `APP_ENCRYPTION_KEY` também protege esses identificadores: não a troque sem migrar os registros.

Não é possível reconhecer um cartão que nunca foi informado, e o Free não exige cartão. Quando um pagamento Stripe disponibiliza fingerprint verificado, a plataforma consulta o PaymentIntent pelo SDK, guarda somente HMAC do fingerprint e vincula-o ao resgate existente. O formulário público nunca aceita fingerprint informado pelo cliente. A comparação por cartão é adicional, quando esse identificador existe; cartões ou documentos diferentes ainda exigem controles operacionais antifraude. Não se promete bloqueio absoluto de múltiplas identidades.

## Restrições aplicadas no backend

- Apenas subdomínio atribuído pela plataforma, sem domínio próprio.
- Backup manual, com retenção de uma cópia; nenhum agendamento automático.
- Até cinco slots de jogos; sites/bots não possuem slots de jogadores.
- Renovação manual gratuita a cada sete dias. Sem renovação: parar/hibernar, nunca apagar os dados por esse motivo.
- Iniciar/reiniciar um Free vencido é negado pela API. O provisionador também deve cumprir o vencimento autonomamente, mesmo se a API estiver fora do ar. A API reconcilia a pausa a cada minuto.

O painel permite renovar, criar backup manual e configurar slots. Agendamento e domínio próprio só são liberados após a aplicação confirmada de um upgrade. A API rejeita adulteração de RAM/CPU/disco, adicionais incompatíveis e alterações de plano pelo endpoint de configurações.

## Produção

O Free independe do Stripe e da compra controlada de lançamento. Ainda exige TLS real, e-mail, backup externo da plataforma e provisionador com isolamento e política Free habilitados. Configure `PLATFORM_SERVICE_DOMAIN` com um domínio realmente controlado, DNS wildcard e roteamento/SSL de serviços no provisionador. Não use o domínio temporário da aplicação como wildcard sem suporte explícito do provedor.

`GET /v1/health` precisa declarar `freeTier:true` e `policiesEnforced:true`; para upgrade, `supportsResize:true`. A presença dessas flags não instala recursos no nó nem constitui auditoria. Consulte `PROVISIONER.md` para os contratos novos. Domínio e backup de cliente só chamam o fornecedor se ele declarar as features correspondentes. Não há provedor real conectado nesta entrega.

## Cupons

Entre em **Operação** (produção/autenticação real) ou **Administração** (demonstração), autentique como administrador e use **Cupons de desconto**. Você pode criar, editar, ativar/desativar, restringir planos, informar início/validade, limite total e uso único por conta. Valor fixo é digitado em reais na UI e persistido em centavos; percentual aceita 1–99%. Cupons não se aplicam ao Free.

O desconto incide sobre o recorrente já reduzido pelo desconto semestral/anual, preserva eventual licença avulsa e mantém mínimo de R$ 1,00 por ciclo pago. Vale em **todas as renovações da assinatura contratada**. A validade limita novas adesões; editar/desativar um cupom não altera o preço de assinaturas ou checkouts já acordados. Isso evita mudança inesperada de fatura.

O checkout congela o preço com desconto no pedido e cria um preço recorrente Stripe desse valor. O webhook exige exatamente o valor acordado. Não há uso de códigos promocionais externos no Checkout. Alterar o preço no navegador não concede desconto.

Reservas contam para limites globais e por conta, junto aos resgates. Não são liberadas por simples passagem de tempo local: isso poderia revender uma utilização cujo pagamento já está em andamento. Cadastre o evento Stripe **`checkout.session.expired`** no webhook. Após expiração assinada de uma sessão não paga, a reserva é liberada; `invoice.paid` confirma um resgate de forma idempotente. Sem esse webhook, uma reserva pode exigir reconciliação manual no suporte. Sessões usam validade de aproximadamente 35 minutos e somente cartão, evitando meios de confirmação assíncrona neste fluxo.

O relatório inclui conta, pedido, desconto, referência de indicação, estado e datas. `attribution` prepara integração futura com afiliados, sem gerar comissões automaticamente. O painel de pagamentos pendentes permite retomar o mesmo checkout sem consumir outro uso.

## Upgrade sem recriar serviço

Abra o serviço Free e clique **Fazer upgrade**. Escolha Starter, Plus, Pro ou Elite, ciclo e cupom opcional. Região, categoria e tecnologia permanecem as mesmas. Recursos maiores continuam sujeitos à revisão administrativa de identidade/pagamento já existente.

Pagamento confirmado enfileira um job de resize com o **mesmo ID de serviço**. O worker pede preservação de dados e aguarda `configurationId` e recursos efetivamente aplicados pelo provisionador. Só então atualiza plano, quotas e permissões no banco. Configurações, endereço, dados e checklist são mantidos. O primeiro ciclo pago começa integralmente na assinatura; Free não tem crédito/prorrata.

Uma falha de upgrade **não chama DELETE** e não apaga o serviço anterior. Após retentativas, o pedido fica para revisão; o operador deve reconciliar estado real, cobrança e eventual reembolso. Não tente um segundo upgrade enquanto o primeiro estiver pendente. O provedor deve preservar volumes inclusive após falha de resize; isso depende da implementação real.

## Verificação

`npm test` inclui os planos, antifraude, transações, expiração/renovação, limites, preservação no upgrade, falha de resize, cupons, reservas e webhooks assinados. O E2E testa cadastro, Free, renovação, criação de cupom na administração, upgrade com desconto e desbloqueio das configurações. Infraestrutura, Stripe e e-mail usam simulações nos testes; executar os testes não confirma um serviço real.
