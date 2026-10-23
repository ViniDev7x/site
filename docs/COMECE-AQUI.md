# Como abrir e testar

Este pacote contém o código atualizado da plataforma Nexora. Ele ainda não está publicado na internet e não deve receber pagamentos reais sem concluir a configuração de produção.

## No seu computador

1. Instale Node.js **24 LTS** pelo site https://nodejs.org/.
2. Extraia o ZIP. Abra a pasta `nexora-site` no VS Code.
3. Abra **Terminal → Novo terminal**, na pasta que contém `package.json`.
4. Execute `npm ci` e aguarde terminar.
5. Execute `npm run dev` e mantenha o terminal aberto.
6. Abra no navegador o endereço que aparece na linha `Local` do Vite.
7. Use a demonstração para navegar e testar a calculadora e o wizard. Ela simula pagamentos e criação de serviços: não cria servidores reais nem envia e-mails externos.
8. Para encerrar, pressione **Ctrl+C** no terminal.

Se a porta estiver ocupada, use o endereço que o terminal indicar. Não abra `index.html` com duplo clique: a aplicação precisa do frontend e da API iniciados pelo comando acima.

## Testes automatizados

Em outro terminal na mesma pasta:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

O último comando abre um ambiente isolado para testar cadastro, confirmação de e-mail, login, compra simulada e painel. As mensagens são capturadas pelo teste; nenhuma compra ou entrega de e-mail externa acontece.

## Colocar na internet

Siga [LAUNCH.md](LAUNCH.md). O caminho recomendado é criar um projeto Railway, enviar este código atualizado, adicionar volume `/data`, variáveis seguras e gerar o domínio HTTPS do Railway. O código está na branch `main` de `ViniDev7x/site`; enviar o código ao GitHub não publica o site automaticamente.

Também faltam: Stripe ativado, domínio remetente no Resend, bucket S3 para backups e infraestrutura/provisionador real para os serviços dos clientes. Railway hospeda a aplicação; ele não cria automaticamente uma operação de hospedagem de jogos, bots e sites.

Vinicius Antunes e Silva é o responsável informado; o contato de suporte/privacidade é `vinitudotwo@gmail.com`. A localização informada foi São Paulo. Complete a localidade/referência verdadeira para correspondência; não invente rua ou número. O CPF informado deve ser configurado apenas no ambiente final e não acompanha este ZIP.

Mantenha o checkout público fechado até concluir a compra controlada e todos os itens do checklist. Nunca cole senhas ou chaves de pagamento em mensagens ou arquivos públicos.
