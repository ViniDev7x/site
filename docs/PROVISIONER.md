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
