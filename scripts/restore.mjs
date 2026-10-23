import { readFile, writeFile, link, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decryptBackup } from '../server/backup.js';
if(existsSync('.env.production'))process.loadEnvFile('.env.production');
const [source,destination]=process.argv.slice(2);
if(!source||!destination||!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY||'')){console.error('Uso: npm run backup:restore -- <backup.sqlite.enc> <novo-arquivo.sqlite>. Configure BACKUP_ENCRYPTION_KEY com segurança.');process.exit(2)}
const target=resolve(destination),tmp=target+'.restore-'+crypto.randomUUID();
try{
 const raw=decryptBackup(await readFile(source),process.env.BACKUP_ENCRYPTION_KEY);await writeFile(tmp,raw,{mode:0o600,flag:'wx'});
 const db=new DatabaseSync(tmp,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Invalid database');db.prepare('SELECT COUNT(*) FROM records').get()}finally{db.close()}
 await link(tmp,target);console.log('Backup restaurado em um novo arquivo e integridade verificada. Pare o serviço e preserve o banco anterior antes de qualquer substituição.');
}catch{console.error('Restauração interrompida. Confira chave, arquivo e destino inexistente. Nenhum banco existente foi sobrescrito.');process.exitCode=1}
finally{await unlink(tmp).catch(()=>{})}
