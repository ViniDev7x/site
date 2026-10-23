// Run outside the hosting VPS (e.g. GitHub Actions). A monitor on the same VPS cannot detect a VPS outage.
const origin=process.env.PUBLIC_URL;
const alert=process.env.UPTIME_ALERT_WEBHOOK;
function secureUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
if(!secureUrl(origin)||!secureUrl(alert)){console.error('Configure PUBLIC_URL HTTPS e o segredo UPTIME_ALERT_WEBHOOK.');process.exit(2)}
const failed=[];
for(const path of ['/','/api/health','/api/ready']){
 let ok=false;
 for(let attempt=0;attempt<2;attempt++){
  try{const r=await fetch(new URL(path,origin),{redirect:'error',signal:AbortSignal.timeout(10000)});const content=await r.text();ok=r.ok&&(path==='/'?content.includes('Nexora'):path.endsWith('health')?JSON.parse(content).ok===true:JSON.parse(content).status==='ready');if(ok)break}catch{}
 }
 if(!ok)failed.push(path);
}
if(failed.length){
 try{const r=await fetch(alert,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:`Nexora: queda ou indisponibilidade detectada em ${failed.join(', ')}. Verifique site, API, banco, e-mail, Stripe, provisionador e backup.`,text:`Nexora indisponível: ${failed.join(', ')}`}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();console.error('ALERTA enviado: endpoint(s) indisponível(is): '+failed.join(', '))}catch{console.error('FALHA: indisponibilidade detectada e alerta não entregue. Verifique o canal de alerta.');process.exit(2)}
 process.exit(1);
}
console.log('OK: site, API e readiness responderam corretamente.');
