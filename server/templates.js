import { zipSync, strToU8 } from "fflate";
const packages = {
  survival: {
    "README.md":
      "# Survival Essentials\n\nConfiguração inicial para Paper/Minecraft. Faça backup e revise as propriedades antes de aplicar. Baixe o servidor somente da fonte oficial. Este pacote não inclui binários, plugins de terceiros ou licenças de Minecraft.\n",
    "server.properties":
      "gamemode=survival\ndifficulty=normal\nmax-players=20\nonline-mode=true\nwhite-list=true\nenable-command-block=false\nview-distance=8\nsimulation-distance=6\n",
    "plugins/README.md":
      "Instale plugins compatíveis com a versão do Paper. Verifique a origem e faça scan antes de executar.\n",
  },
  moderation: {
    "README.md":
      "# Guard — Bot de moderação\n\nRequer Node.js 22+. Execute npm install. Configure DISCORD_TOKEN no cofre de segredos ou no ambiente do processo e execute npm start. Ative Guild Messages e Message Content no Developer Portal. O bot precisa da permissão Manage Messages. O exemplo remove convites Discord de membros sem permissão de moderação. Revise as regras antes de usar. Nunca versione seu token.\n",
    "package.json": JSON.stringify(
      {
        name: "guard-starter",
        private: true,
        type: "module",
        scripts: { start: "node index.js" },
        dependencies: { "discord.js": "^14.19.0" },
      },
      null,
      2,
    ),
    ".gitignore": "node_modules\n.env\n",
    "index.js": `import { Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('Configure DISCORD_TOKEN no ambiente.');
const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
client.once('ready',()=>console.log('Guard online.'));
client.on('messageCreate',async message=>{
  if(!message.guild || message.author.bot || !message.member) return;
  if(message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  if(/(?:discord\\.gg|discord(?:app)?\\.com\\/invite)\\//i.test(message.content)) {
    try { await message.delete(); } catch { console.error('Não foi possível moderar a mensagem; confira as permissões.'); }
  }
});
client.login(token);
`,
  },
  portfolio: {
    "README.md":
      "# Portfolio Starter\n\nSite estático. Abra index.html para visualizar e substitua os textos pelos seus. Para publicar, sirva a pasta por HTTP/HTTPS e configure DNS/SSL na sua hospedagem.\n",
    "index.html":
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meu portfólio</title><link rel="stylesheet" href="style.css"><body><nav>Meu portfólio <a href="#projetos">Projetos</a></nav><main><p>DESIGN · DESENVOLVIMENTO · IDEIAS</p><h1>Transformando ideias<br>em experiências.</h1><p>Olá! Este é o começo do meu próximo projeto.</p><a class="button" href="mailto:contato@example.com">Vamos conversar ↗</a><section id="projetos"><h2>Projetos selecionados</h2><article><h3>Seu próximo grande projeto</h3><p>Adicione uma descrição e um link para seu trabalho.</p></article></section></main></body></html>',
    "style.css":
      "body{margin:0;background:#f7f5fc;color:#302843;font:16px system-ui}nav{padding:30px 8%;border-bottom:1px solid #e6dff0;display:flex;justify-content:space-between}a{color:#8c6ac7}main{padding:90px 8%;max-width:1000px}h1{font-size:clamp(35px,7vw,80px);letter-spacing:-3px;line-height:1.1}p{color:#8b7d9f;line-height:1.8}.button{display:inline-block;padding:15px 25px;background:#8c6ac7;color:white;border-radius:8px;text-decoration:none;margin-top:20px}section{margin-top:110px}article{background:white;border:1px solid #e6dff0;padding:35px;border-radius:15px}",
  },
};
export function templateArchive(id) {
  const files = packages[id];
  if (!files) throw new Error("Template não encontrado.");
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [
        `${id}/${path}`,
        strToU8(content),
      ]),
    ),
  );
}
