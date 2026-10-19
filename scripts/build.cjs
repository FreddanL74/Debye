'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const image='data:image/jpeg;base64,'+fs.readFileSync(path.join(root,'examples/wc-experimental.jpg')).toString('base64');
const escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
let html=read('page.template.html');
html=html.replace('<link rel="stylesheet" href="style.css">','<style>\n'+read('style.css')+'\n</style>');
html=html.replace('<script defer src="debye-core.js"></script>','').replace('<script defer src="app.js"></script>','');
const app=read('app.js').replace("'examples/wc-experimental.jpg'",JSON.stringify(image));
if(app===read('app.js'))throw Error('WC image embedding target missing');
html=html.replace('</body>', '<script>\n'+escapeScript(read('debye-core.js'))+'\n</script>\n<script>\n'+escapeScript(app)+'\n</script>\n</body>');
if(/<(?:script[^>]+src=|link[^>]+href="style\.css)/i.test(html))throw Error('External application assets remain');
const version=crypto.createHash('sha256').update(html).digest('hex').slice(0,10);
html=html.replace('<html lang="sv">','<html lang="sv" data-app-version="'+version+'">').replace('Lokalt i din webbläsare','Lokalt · v'+version);
for(const name of ['index.html','Debye_lab.html']){
  const target=path.join(root,name);
  if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==html)throw Error(name+' is stale; run npm run build');}
  else fs.writeFileSync(target,html);
}
console.log('Version '+version);
console.log('Built standalone index.html and Debye_lab.html ('+Buffer.byteLength(html)+' bytes each)');
