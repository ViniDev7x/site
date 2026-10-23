# Contrato do provisionador real — requisito de cobrança

A plataforma **não instala Wings/Docker nem cria uma VPS**. A API Node fala com um provisionador separado, autenticado por `PROVISIONER_TOKEN` e servido por HTTPS em `PROVISIONER_URL`. Ele precisa existir e ser operado com isolamento, limites de recursos e tratamento de abuso antes de aceitar clientes. Não conecte um mock ou um endpoint que apenas retorne `ready` à produção.

Para integrar Wings/Pterodactyl, um operador deve fornecer um adaptador que traduza este contrato para os eggs, nós, volumes, portas e ações reais do painel. Essa configuração não pode ser inferida sem o painel e suas credenciais. Não monte o socket Docker do host no container da aplicação pública.

## Saúde e capacidade real

`GET /v1/health` com `Authorization: Bearer <token>`:

```json
{
  "ready": true,
  "mode": "production",
  "isolationEnforced": true,
  "categories": ["Sites"],
  "types": {"Sites": ["Estático", "Next.js"]},
  "regions": ["São Paulo, BR"],
  "limits": {"ram": 8, "cpu": 4, "disk": 100}
}
```

Declare somente categorias/versões/regiões que o servidor realmente entrega. O checkout rejeita o restante. `isolationEnforced` é uma declaração contratual do operador, não uma auditoria automática dos namespaces ou do hipervisor. Verifique isolamento e quotas no nó antes de autorizar vendas.

## Criação idempotente

`POST /v1/services` recebe `Idempotency-Key` igual ao ID solicitado. Mesmo corpo/chave após timeout deve devolver o mesmo serviço; nunca criar duplicatas. Corpo:

```json
{"id":"uuid","ownerId":"uuid","name":"Projeto","category":"Sites","subtype":"Estático","resources":{"category":"Sites","region":"São Paulo, BR","ram":2,"cpu":1,"disk":20,"cycle":"monthly","agency":"personal","addons":{},"template":null}}
```

Resposta: `{"id":"uuid","status":"provisioning"}`. O ID deve ser o solicitado. Não execute comandos shell fornecidos pelo cliente nem concatene nome/domínio a comandos. A autenticação da API de provisionamento não deve conceder acesso à API pública.

## Readiness do serviço

`GET /v1/services/<id>`:

- `{"id":"uuid","status":"provisioning"}` enquanto instala.
- `{"id":"uuid","status":"ready","address":"host-ou-ip:porta","metrics":{"cpuPercent":5,"ramGB":0.4,"diskGB":1.2}}` somente quando a aplicação aceita conexões reais.
- `status: "stopped"`, `"offline"`, `"restarting"` ou `"failed"` para os demais estados.
- Métricas são opcionais; se ausentes, o painel informa indisponibilidade em vez de inventar valores.

Antes de reportar `ready`, faça um smoke test do processo/container e da porta/protocolo do serviço. O cliente precisa conseguir usar o endereço informado. A plataforma faz polling e só envia “serviço pronto” depois dessa resposta.

## Ações e compensação

`POST /v1/services/<id>/actions`, corpo `{"action":"start|stop|restart"}`. Retorne 2xx somente após aceitar a operação na infraestrutura real; falhas devem retornar erro. As ações devem ser idempotentes para a chave fornecida.

`DELETE /v1/services/<id>` remove recursos parciais de uma criação com falha e responde `{"deleted":true}`. Deve funcionar inclusive após timeout de criação, usando o ID idempotente. Se o recurso já não existir, confirme a remoção em vez de falhar. A plataforma só marca rollback confirmado após essa resposta.

A criação é retomada após reiniciar a API. Timeouts são repetidos com o mesmo ID; após falhas repetidas ou 30 minutos, há compensação e alerta ao suporte. **Reembolso de falha ainda exige intervenção do operador no Stripe**; um cliente não deve ficar sem resposta enquanto uma cobrança permanece retida. O lançamento controlado precisa testar também esse procedimento.

## Planos, Free e ampliação sem perda de dados

Além das chaves anteriores, saúde pode declarar:

```json
{"freeTier":true,"policiesEnforced":true,"supportsResize":true,"features":{"settings":true,"backups":true},"limits":{"ram":64,"cpu":32,"disk":1000}}
```

Somente declare o que foi implementado no nó. Sem `freeTier` e `policiesEnforced`, a plataforma recusa criação Free. Os limites representam capacidade real e a plataforma os limita a 64 GB RAM, 32 vCPU e 1000 GB disco nesta versão. A API não mantém o teto antigo de 8 GB quando o nó suporta mais.

A criação envia também `policies` (entitlements calculados pelo servidor), `platformHostname` e `freeRenewBy` quando Free. Imponha cgroups/VM, slots, ausência de domínio próprio, bloqueio de agendas automáticas e retenção de um backup manual. Configure DNS wildcard e proxy/portas/SSL necessários. O Free deve responder em `address` exatamente com o `platformHostname` solicitado. Para jogos, portas exclusivas devem ser representadas no mecanismo de roteamento do hostname (por exemplo SRV ou proxy adequado); não substitua por um domínio arbitrário.

Imponha a parada por vencimento no próprio provisionador, preservando volumes mesmo quando a API Node não está disponível. `POST /v1/services/<id>/free-renewal` recebe `{"renewBy":"ISO-8601"}` autenticado e atualiza o prazo; não liga automaticamente o processo. A aplicação então permite iniciar pelo painel. A operação deve ser idempotente para a chave fornecida.

`PATCH /v1/services/<id>/settings` recebe `{"customDomain":"exemplo.com","backupSchedule":"manual|daily|weekly","slots":20}`. Aplique apenas dentro das policies atuais. Aplique DNS/SSL e jobs de backup reais; não retorne sucesso se somente armazenou uma configuração sem efeito. `POST /v1/services/<id>/backups` solicita backup manual e deve respeitar retenção do plano e autorização do serviço. Backup dos clientes é separado do S3 de backup da plataforma.

`PATCH /v1/services/<id>/resources`, com `Idempotency-Key: upgrade:<orderId>`, recebe:

```json
{"resources":{"plan":"starter","ram":6,"cpu":3,"disk":60,"category":"Sites","region":"São Paulo, BR","cycle":"monthly"},"policies":{"free":false,"customDomain":true,"automaticBackup":true,"manualBackup":true,"backupRetention":7,"maxSlots":0,"renewalDays":null},"configurationId":"orderId","preserveData":true}
```

Amplie o **mesmo** serviço/volume/IP/endereço; nunca recrie ou formate os dados. Se o disco não permitir resize seguro, retorne erro e encaminhe para revisão. Repetir a chave deve produzir a mesma operação. `GET /v1/services/<id>` passa a incluir `configurationId` e `resources` efetivamente aplicados. O worker só conclui com ID da configuração correto, RAM/CPU/disco exatos e estado `ready` ou `stopped`. Implemente as novas permissões de domínio/backup em conjunto com o resize e remova o prazo Free apenas quando ele tiver sucesso. Se falhar, preserve o serviço anterior. O worker de upgrade nunca envia DELETE.
