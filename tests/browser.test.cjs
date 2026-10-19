'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
test('browser: full synthetic fit, exports, WC image, raw imports, error handling and mobile layout', {timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const executable=process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.DebyeLab?.state.last);
  const initial=await page.evaluate(()=>DebyeLab.state.last.fit.rwp);assert.ok(initial>.2);
  await page.click('#findCenter');await page.waitForFunction(()=>!DebyeLab.state.busy);
  assert.ok(Math.abs(+await page.locator('#cx').inputValue()-190.4)<.2);
  await page.click('#fitModel');await page.waitForFunction(()=>!DebyeLab.state.busy,null,{timeout:60000});
  const state=await page.evaluate(()=>({p:DebyeLab.uiParams(),fit:DebyeLab.state.last.fit,record:DebyeLab.state.fitRecord}));
  assert.ok(Math.abs(state.p.r-.72)<.01);assert.ok(Math.abs(state.p.stress-1200)<35);assert.ok(Math.abs(state.p.stressAngle-35)<1);assert.ok(Math.abs(state.p.textureAngle-70)<1);assert.ok(state.fit.rwp<.012);assert.ok(state.record.evaluations>30);
  console.log('Synthetic browser fit:',JSON.stringify({r:state.p.r,stressMPa:state.p.stress,stressAngle:state.p.stressAngle,textureAngle:state.p.textureAngle,R:state.fit.rwp}));
  const dl=page.waitForEvent('download');await page.click('#exportJSON');const download=await dl;const json=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(json.parameters.stress,state.p.stress);assert.match(json.cif.text,/data_TiN/);assert.equal(json.data.qualitative,false);assert.equal(json.fit.type,'textur/spänning');
  const csvDL=page.waitForEvent('download');await page.click('#exportResidual');const csv=await csvDL;assert.match(fs.readFileSync(await csv.path(),'utf8'),/NaN=masked/);
  await page.click('#wcExample');await page.waitForFunction(()=>!DebyeLab.state.busy);assert.match(await page.locator('#dataWarning').textContent(),/färglagd/);assert.equal(await page.evaluate(()=>DebyeLab.state.image.originalWidth),2048);assert.equal(await page.evaluate(()=>DebyeLab.state.image.bin),4);assert.equal(+await page.locator('#E').inputValue(),450000);assert.equal(+await page.locator('#nu').inputValue(),.25);assert.equal(await page.locator('#lambda').getAttribute('min'),'.17');assert.equal(await page.locator('#lambda').getAttribute('max'),'.20');
  await page.click('#findCenter');await page.waitForFunction(()=>!DebyeLab.state.busy);const cx=+await page.locator('#cx').inputValue(),cy=+await page.locator('#cy').inputValue();assert.ok(Math.abs(cx-1039.2)<2);assert.ok(Math.abs(cy-1012.6)<2);console.log('WC center in original pixels:',cx,cy);
  // Numeric import retains intensity units and NaN instead of converting through an 8-bit canvas.
  await page.click('#synthetic');await page.waitForFunction(()=>!DebyeLab.state.busy);
  const matrix=await page.evaluate(()=>{const im=DebyeLab.state.image;const rows=[];for(let y=0;y<im.height;y++)rows.push(Array.from(im.data.subarray(y*im.width,(y+1)*im.width),(v,i)=>y===0&&i===0?'NaN':v*10000).join(','));return rows.join('\n');});
  await page.locator('#dataFile').setInputFiles({name:'raw.csv',mimeType:'text/csv',buffer:Buffer.from(matrix)});await page.waitForFunction(()=>!DebyeLab.state.busy);assert.equal(await page.evaluate(()=>DebyeLab.state.image.name),'raw.csv');assert.ok(await page.evaluate(()=>DebyeLab.state.image.data.some(v=>v>255)));assert.ok(await page.evaluate(()=>Number.isNaN(DebyeLab.state.image.data[0])));assert.ok(await page.evaluate(()=>!!DebyeLab.state.last));
  await page.locator('#cifFile').setInputFiles(path.join(root,'examples','TiN.cif'));await page.waitForFunction(()=>!DebyeLab.state.busy);assert.match(await page.locator('#structureInfo').textContent(),/TiN.cif/);
  await page.locator('#axisH').fill('0');await page.locator('#axisH').dispatchEvent('change');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Fel:'));assert.match(await page.locator('#status').textContent(),/heltalsriktning/);assert.equal(await page.locator('#exportJSON').isDisabled(),true);
  await page.click('#synthetic');await page.waitForFunction(()=>!DebyeLab.state.busy);
  await page.click('#fitModel');await page.waitForFunction(()=>DebyeLab.state.busy);await page.click('#cancel');await page.waitForFunction(()=>!DebyeLab.state.busy);assert.match(await page.locator('#status').textContent(),/Avbruten/);assert.equal(await page.locator('#fitModel').isDisabled(),false);
  await page.setViewportSize({width:390,height:844});await page.click('#synthetic');await page.waitForFunction(()=>!DebyeLab.state.busy);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  assert.deepEqual(errors,[]);
 } finally {await browser.close();await new Promise(r=>server.close(r));}
});
