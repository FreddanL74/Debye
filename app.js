/* UI for Debye Lab. User file contents are data, never HTML or code. */
'use strict';
const D=window.Debye,$=id=>document.getElementById(id);
const fields=['cx','cy','pixel','distance','lambda','r','textureAngle','stress','stressAngle','E','nu','fwhm','qmax','maskInner','maskOuter'];
let image=null,crystal=null,cifText=D.TIN_CIF,cifName='TiN (idealiserad full cell)',last=null,ringsCache=null,busy=false,cancelled=false,renderTimer=null,revision=0,fitRecord=null;
const defaults={cx:191.5,cy:191.5,pixel:.4,distance:240,lambda:12.3984198433/80,r:1,textureAngle:90,stress:0,stressAngle:0,E:450000,nu:.2,fwhm:.06,qmax:9,maskInner:18,maskOuter:270};
function status(s){$('status').textContent=s;}
function error(e){status('Fel: '+(e.message||String(e)));console.error(e);}
function setFields(p){for(const k of fields)if(p[k]!==undefined)$(k).value=String(+p[k].toFixed(7));}
function uiParams(){const p=Object.fromEntries(fields.map(k=>[k,+$(k).value]));for(const k of fields)if($(k).value.trim()==='')throw Error('Fyll i '+k+'.');p.axis=['axisH','axisK','axisL'].map(k=>+$(k).value);if(p.axis.some(v=>!Number.isInteger(v))||!Math.hypot(...p.axis))throw Error('Ange en heltalsriktning skild från [0 0 0].');p.lambdaBounds=[+$('lambda').min,+$('lambda').max];p.background=$('background').checked;p.polarized=$('polarized').checked;D.validateParams(p);return p;}
function internalParams(p=uiParams()){
  const bin=image?.bin||1,offset=(bin-1)/2;
  return {...p,cx:(p.cx-offset)/bin,cy:(p.cy-offset)/bin,pixel:p.pixel*bin,maskInner:p.maskInner/bin,maskOuter:p.maskOuter/bin};
}
function externalParams(p){const bin=image?.bin||1,offset=(bin-1)/2;return {...p,cx:p.cx*bin+offset,cy:p.cy*bin+offset,pixel:p.pixel/bin,maskInner:p.maskInner*bin,maskOuter:p.maskOuter*bin};}
function getRings(p){const key=JSON.stringify([p.qmax,p.axis]);if(!ringsCache||ringsCache.key!==key){const rings=D.reflections(crystal,p.qmax,p.axis);if(!rings.length)throw Error('Inga reflexer inom valt q-intervall.');ringsCache={key,rings};}return ringsCache.rings;}
function loadStructure(text,name){const c=D.parseCIF(text);crystal=c;cifText=text;cifName=name;ringsCache=null;const elements=new Set(c.atoms.map(a=>a.el)),isWC=elements.size===2&&elements.has('W')&&elements.has('C');$('lambda').min=isWC?'.17':'.01';$('lambda').max=isWC?'.20':'5';$('lambdaHint').textContent=isWC?'WC: angivet sökintervall 0,17–0,20 Å.':'Ange känd våglängd eller kalibrera med känt avstånd.';if(isWC)setFields({E:450000,nu:.25,lambda:D.clamp(+$('lambda').value,.17,.20)});$('structureInfo').textContent=`${name} · ${c.atoms.length} atomer i cellen · a=${c.cell[0].toFixed(4)}, b=${c.cell[1].toFixed(4)}, c=${c.cell[2].toFixed(4)} Å. ${c.warnings.join(' ')}`;}
function invalidate(){fitRecord=null;$('fitNotice').textContent='Parametrarna har ändrats. Visade värden är aktuella modellparametrar, inte en ny automatisk anpassning.';last=null;for(const id of ['exportJSON','exportCSV','exportResidual','exportPNG'])$(id).disabled=true;}
function requestRender(){if(busy)return;revision++;invalidate();clearTimeout(renderTimer);renderTimer=setTimeout(()=>{try{calculate();}catch(e){error(e);}},160);}
function reduceImage(raw){
  const {width,height,data}=raw;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width*height>17000000||data.length!==width*height)throw Error('Bilden måste ha minst 8 × 8 och högst 17 miljoner pixlar.');
  let finite=0,max=-Infinity,min=Infinity;for(const v of data)if(Number.isFinite(v)){finite++;max=Math.max(max,v);min=Math.min(min,v);}else if(!Number.isNaN(v))throw Error('Oändliga intensiteter stöds inte. Använd NaN för mask.');
  if(finite<30||max<=min)throw Error('Data saknar tillräcklig intensitetsvariation.');
  const bin=Math.max(1,Math.ceil(Math.max(width,height)/640)),w=Math.floor(width/bin),h=Math.floor(height/bin),out=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0,n=0;for(let j=0;j<bin;j++)for(let i=0;i<bin;i++){const v=data[(y*bin+j)*width+x*bin+i];if(Number.isFinite(v)){sum+=v;n++;}}
    // Any invalid original pixel masks its entire analysis block.
    out[y*w+x]=n===bin*bin?sum/n:NaN;
  }
  return {width:w,height:h,data:out,bin,originalWidth:width,originalHeight:height};
}
function installImage(raw,meta={}){
  const reduced=reduceImage(raw);image={...reduced,...meta};revision++;last=null;fitRecord=null;
  const bin=image.bin;$('dataInfo').textContent=`${image.name||'Data'} · original ${image.originalWidth} × ${image.originalHeight} px · beräkning ${image.width} × ${image.height} px · blockmedel ${bin} × ${bin}. Intensiteter i ${image.units||'dataenheter'}.`;
  $('dataWarning').textContent=image.warning||'';$('truth').textContent='';
  const size=Math.min(image.originalWidth,image.originalHeight);setFields({cx:(image.originalWidth-1)/2,cy:(image.originalHeight-1)/2,maskInner:size*.04,maskOuter:Math.hypot(image.originalWidth,image.originalHeight)/2});
  invalidate();
}
function calculate(){
  if(!image||!crystal)return;
  const p=internalParams(),rings=getRings(p);status('Beräknar experiment, modell och differens…');
  const result=D.render(image,rings,p);
  if(!Number.isFinite(result.fit.rmse)||result.fit.n<30)throw Error('För få giltiga pixlar i masken.');
  if(!result.fit.a)throw Error('Modellen saknar överlappande signal. Kontrollera CIF, λ, avstånd, q-max och mask.');
  last={...result,p,rings,revision};draw();showResults();
  for(const id of ['exportJSON','exportCSV','exportResidual','exportPNG'])$(id).disabled=false;
  status(`Beräknat · ${rings.length} d-grupper · ${result.fit.n.toLocaleString('sv-SE')} omaskerade pixlar. ${image.qualitative?'Bildjämförelse – ej kvantitativa intensiteter.':''}`);
}
function maxData(){let max=0;for(const v of image.data)if(Number.isFinite(v))max=Math.max(max,Math.abs(v));return max||1;}
function drawArray(id,values,residual=false){
  const cv=$(id);cv.width=image.width;cv.height=image.height;const ctx=cv.getContext('2d'),im=ctx.createImageData(image.width,image.height),max=maxData(),limit=max*(+$('residualRange').value||30)/100,mode=$('displayScale').value;
  for(let i=0;i<values.length;i++){
    let rgb;if(!last.mask[i]||!Number.isFinite(values[i]))rgb=[185,192,201];
    else if(residual){const t=D.clamp(values[i]/limit,-1,1),a=Math.abs(t);rgb=t<0?[255-221*a,255-154*a,255-58*a]:[255-58*a,255-200*a,255-200*a];}
    else{let t=D.clamp(values[i]/max,0,1);t=mode==='sqrt'?Math.sqrt(t):mode==='log'?Math.log1p(99*t)/Math.log(100):t;const c=255*(1-t);rgb=[c,c,c];}
    im.data.set([...rgb,255],i*4);
  }ctx.putImageData(im,0,0);
}
function drawOverlay(){
  const cv=$('overlay');cv.width=image.width;cv.height=image.height;const ctx=cv.getContext('2d'),p=last.p,scale=image.width/512;
  ctx.strokeStyle='#dd4289';ctx.lineWidth=Math.max(.8,scale);ctx.beginPath();ctx.moveTo(p.cx-8*scale,p.cy);ctx.lineTo(p.cx+8*scale,p.cy);ctx.moveTo(p.cx,p.cy-8*scale);ctx.lineTo(p.cx,p.cy+8*scale);ctx.stroke();
  if($('showRings').checked){ctx.strokeStyle='#06a6b499';ctx.lineWidth=Math.max(.5,.75*scale);for(const r of last.rings){const t=2*Math.asin(p.lambda/(2*r.d)),rad=p.distance*Math.tan(t)/p.pixel;if(!Number.isFinite(rad)||t>=Math.PI/2||rad>Math.hypot(image.width,image.height))continue;ctx.beginPath();ctx.arc(p.cx,p.cy,rad,0,2*Math.PI);ctx.stroke();}}
}
function radialProfiles(){
  const n=350,p=last.p,rr=Math.max(...[[0,0],[image.width,0],[0,image.height],[image.width,image.height]].map(([x,y])=>Math.hypot(x-p.cx,y-p.cy))),ttmax=Math.atan(rr*p.pixel/p.distance)/D.RAD;
  const exp=new Float64Array(n),calc=new Float64Array(n),count=new Uint32Array(n),angles=Float64Array.from({length:n},(_,i)=>(i+.5)*ttmax/n);
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const i=y*image.width+x;if(!last.mask[i])continue;const tt=Math.atan(Math.hypot(x-p.cx,y-p.cy)*p.pixel/p.distance)/D.RAD,j=Math.min(n-1,Math.floor(tt/ttmax*n));exp[j]+=image.data[i];calc[j]+=last.calculated[i];count[j]++;}
  for(let i=0;i<n;i++){exp[i]=count[i]?exp[i]/count[i]:NaN;calc[i]=count[i]?calc[i]/count[i]:NaN;}
  return {angles,exp,calc,count};
}
function drawProfiles(){
  const {angles,exp,calc}=radialProfiles(),cv=$('profiles'),ctx=cv.getContext('2d'),W=cv.width,H=cv.height,L=65,R=W-20,T=20,B=H-45;
  ctx.clearRect(0,0,W,H);let max=0,min=0;const residual=Float64Array.from(exp,(v,i)=>v-calc[i]);for(const a of [exp,calc,residual])for(const v of a)if(Number.isFinite(v)){max=Math.max(max,v);min=Math.min(min,v);}if(max===min)max++;
  const x=i=>L+i/(angles.length-1)*(R-L),y=v=>B-(v-min)/(max-min)*(B-T);
  ctx.font='13px system-ui';ctx.fillStyle='#65748a';ctx.strokeStyle='#dce3ec';
  for(let j=0;j<=5;j++){let xx=L+j/5*(R-L),v=angles[angles.length-1]*j/5;ctx.beginPath();ctx.moveTo(xx,T);ctx.lineTo(xx,B);ctx.stroke();ctx.fillText(v.toFixed(1),xx-10,H-23);}
  for(const [data,color]of [[exp,'#27384a'],[calc,'#0799a3'],[residual,'#c84343']]){ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();let connected=false;for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i])){connected=false;continue;}if(!connected)ctx.moveTo(x(i),y(data[i]));else ctx.lineTo(x(i),y(data[i]));connected=true;}ctx.stroke();}
  ctx.fillStyle='#65748a';ctx.fillText('2θ (°)',W/2,H-3);ctx.fillText(max.toPrecision(3),4,T+8);ctx.fillText(min.toPrecision(3),4,B);ctx.fillText(image.units||'I',4,12);
}
function draw(){if(!last)return;drawArray('experiment',image.data);drawArray('calculated',last.calculated);drawArray('difference',last.residual,true);drawOverlay();drawProfiles();}
function showResults(){
  const p=externalParams(last.p),f=last.fit,metrics=[['March–Dollase r',p.r.toFixed(4)],['Spänning σ',p.stress.toFixed(1)+' MPa'],['Spänningsriktning',Math.abs(p.stress)<1?'Ej bestämd':((p.stressAngle%180+180)%180).toFixed(1)+'°'],['Texturriktning',Math.abs(p.r-1)<.002?'Ej bestämd':((p.textureAngle%180+180)%180).toFixed(1)+'°'],['Centrum x / y',p.cx.toFixed(2)+' / '+p.cy.toFixed(2)],['Avstånd / λ',p.distance.toFixed(3)+' mm / '+p.lambda.toFixed(6)+' Å'],['RMSE',f.rmse.toPrecision(4)],['R (oviktad)',(f.rwp*100).toFixed(3)+' %'],['Skala / bakgrund',f.a.toPrecision(4)+' / '+f.b.toPrecision(4)]];
  $('results').replaceChildren(...metrics.map(([label,value])=>{const el=document.createElement('div');el.className='metric';const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=value;span.textContent=label;el.append(strong,span);return el;}));
}
function setBusy(value){busy=value;for(const el of document.querySelectorAll('#controls input,#controls select,#controls button,#calculate'))el.disabled=value;$('cancel').disabled=!value;}
async function runTask(fn){if(busy)return;clearTimeout(renderTimer);cancelled=false;invalidate();setBusy(true);await new Promise(r=>setTimeout(r,20));try{await fn();}catch(e){error(e);}finally{setBusy(false);}}
async function fit(keys,label){
  const p=internalParams();if(label==='geometri'){p.stress=0;setFields({stress:0});}
  const rings=getRings(p),start=D.evaluate(D.samples(image,p,10000),rings,p).rwp;
  status('Anpassar '+label+'…');
  const result=await D.optimize(image,rings,p,keys,({fit,iteration,evaluations})=>status(`Anpassar ${label} · steg ${iteration}, ${evaluations} utvärderingar · R ${(fit.rwp*100).toFixed(3)} %`),()=>cancelled);
  setFields(externalParams(result.p));fitRecord={type:label,keys,initialR:start,iterations:result.iterations,evaluations:result.evaluations};calculate();
  $('fitNotice').textContent=`Lokal anpassning av ${label} slutförd (${result.evaluations} modellutvärderingar). R på anpassningens stickprov: ${(start*100).toFixed(3)} → ${(result.fit.rwp*100).toFixed(3)} %. Bild och resultat ovan använder hela analysbilden. ${image.qualitative?'Kvalitativ bild: r och σ är endast illustrativa modellvärden.':'Ingen osäkerhets- eller unikhetsanalys har gjorts.'}`;
}
async function imageFromURL(url,name,warning=''){
  const img=new Image();img.src=url;await img.decode();
  if(img.naturalWidth*img.naturalHeight>17000000)throw Error('Bilden överskrider 17 miljoner pixlar.');
  const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;const ctx=cv.getContext('2d');ctx.drawImage(img,0,0);const rgba=ctx.getImageData(0,0,cv.width,cv.height).data,data=new Float32Array(cv.width*cv.height);let colored=false;
  const invert=$('imageMode').value==='inverted';
  for(let i=0;i<data.length;i++){const [r,g,b,a]=rgba.subarray(i*4,i*4+4);if(Math.max(r,g,b)-Math.min(r,g,b)>4)colored=true;const value=.2126*r+.7152*g+.0722*b;data[i]=a<255?NaN:invert?255-value:value;}
  const qualitative=colored||/\.jpe?g$/i.test(name);installImage({width:cv.width,height:cv.height,data},{name,units:'bildvärden',qualitative,warning:warning||(colored?'Färglagd bild: luminans är inte ursprunglig diffraktionsintensitet. Använd för centrum/ringpositioner. Texturanpassning är endast kvalitativ.':qualitative?'JPEG kan vara komprimerad och tonmappad. Använd linjära råintensiteter för kvantitativa resultat.':'Kontrollera att bildvärdena är linjära detektorintensiteter; appen tar inte bort gamma eller logaritmisk bildbehandling.')});
}
async function loadFile(file){
  if(!file)return;if(file.size>150*1024*1024)throw Error('Filen är för stor (max 150 MB).');
  const name=file.name.toLowerCase();
  if(/\.tiff?$/.test(name))installImage(D.readTIFF(await file.arrayBuffer()),{name:file.name,units:'detektorintensitet'});
  else if(/\.(csv|txt)$/.test(name))installImage(D.parseMatrix(await file.text()),{name:file.name,units:'dataenheter'});
  else if(name.endsWith('.json')){
    const json=JSON.parse(await file.text());let raw;
    if(Array.isArray(json)){if(!json.length||!json.every(r=>Array.isArray(r)&&r.length===json[0].length))throw Error('JSON måste vara en rektangulär matris.');raw={width:json[0].length,height:json.length,data:json.flat().map(v=>v===null?NaN:v)};}
    else raw={width:json.width,height:json.height,data:json.data?.map(v=>v===null?NaN:v)||[]};
    if(raw.data.some(v=>typeof v!=='number'))throw Error('JSON-intensiteter måste vara tal (null = mask).');
    installImage({...raw,data:Float32Array.from(raw.data)},{name:file.name,units:'dataenheter'});
  }else if(/\.(png|jpe?g|webp)$/.test(name)){const url=URL.createObjectURL(file);try{await imageFromURL(url,file.name);}finally{URL.revokeObjectURL(url);}}
  else throw Error('Formatet stöds inte. Välj TIFF, PNG/JPEG/WebP, CSV eller JSON.');
  fitRecord=null;calculate();$('fitNotice').textContent='Ny experimentfil. Ange pixelstorlek och geometri, välj CIF och hitta centrum före anpassning.';
}
function synthetic(){
  loadStructure(D.TIN_CIF,'TiN (full cell, a = 4,4 Å)');setFields(defaults);$('axisH').value=1;$('axisK').value=0;$('axisL').value=0;$('background').checked=true;$('polarized').checked=true;
  const truth={...defaults,axis:[1,0,0],background:true,polarized:true,cx:190.4,cy:194.2,r:.72,textureAngle:70,stress:1200,stressAngle:35},rings=D.reflections(crystal,truth.qmax,truth.axis),model=D.modelTables(rings,truth),width=384,height=384,data=new Float32Array(width*height);
  let seed=7341;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=2*D.intensity(x,y,truth,model)+.035+(random()-.5)*.002;
  installImage({width,height,data},{name:'Syntetiskt TiN · känt facit',units:'relativ intensitet',truth});setFields(defaults);calculate();
  $('truth').textContent='Syntetiskt facit: centrum (190,4; 194,2) px · r = 0,72 · texturriktning 70° · σ = 1200 MPa · spänningsriktning 35°. Detta är testdata, inte ditt experiment.';
  $('fitNotice').textContent='Testa arbetsflödet: hitta centrum och anpassa sedan textur/spänning. Avstånd och våglängd är redan rätt i testet.';
}
function download(name,text,type='text/plain'){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
for(const el of document.querySelectorAll('[data-param]'))el.addEventListener('change',requestRender);
$('dataFile').onchange=()=>runTask(()=>loadFile($('dataFile').files[0]));
$('cifFile').onchange=()=>runTask(async()=>{const f=$('cifFile').files[0];if(!f)return;loadStructure(await f.text(),f.name);calculate();});
$('imageMode').onchange=()=>{if($('dataFile').files[0])runTask(()=>loadFile($('dataFile').files[0]));};
$('tinPreset').onclick=()=>{loadStructure(D.TIN_CIF,'TiN (full cell)');setFields({E:450000,nu:.2});requestRender();};
$('wcPreset').onclick=()=>{loadStructure(D.WC_CIF,'WC (full cell)');setFields({E:450000,nu:.25});requestRender();};
$('synthetic').onclick=()=>runTask(synthetic);
$('wcExample').onclick=()=>runTask(async()=>{
  await imageFromURL('examples/wc-experimental.jpg','WC – din inbäddade JPEG','Din WC-bild är färglagd JPEG. Centrum och ringpositioner kan undersökas, men originalintensiteterna saknas: texturvärden är inte kvantitativa.');
  loadStructure(D.WC_CIF,'WC (full cell från gitterparametrarna i din fil)');$('axisH').value=0;$('axisK').value=0;$('axisL').value=1;
  const lambda=.2,d=2.84015,dp=270/Math.tan(2*Math.asin(lambda/(2*d)));
  setFields({cx:1039.2,cy:1012.6,pixel:.1,distance:dp*.1,lambda,E:450000,nu:.25,fwhm:.025,qmax:11,r:1,stress:0,textureAngle:90,stressAngle:0,maskInner:80,maskOuter:1050});calculate();
  $('fitNotice').textContent='WC-geometrin är hämtad från din fil. Pixelstorlek 0,1 mm är ett antagande för exemplet: ange detektorns riktiga värde innan du tolkar avståndet i mm.';
});
$('calculate').onclick=()=>{try{clearTimeout(renderTimer);calculate();}catch(e){error(e);}};
$('findCenter').onclick=()=>runTask(async()=>{
  const p=internalParams(),c=await D.findCenter(image,p,v=>status(`Söker centrum: x=${(v.cx*image.bin+(image.bin-1)/2).toFixed(2)}, y=${(v.cy*image.bin+(image.bin-1)/2).toFixed(2)} px`),()=>cancelled);
  setFields(externalParams({...p,cx:c.cx,cy:c.cy}));calculate();$('fitNotice').textContent='Centrum uppskattat från ringgradienter och 180°-symmetri. Kontrollera krysset mot ringarna; fläckar och asymmetri kan påverka läget.';
});
$('fitGeometry').onclick=()=>runTask(()=>fit([$('geometryFit').value],'geometri'));
$('fitModel').onclick=()=>runTask(()=>fit([...document.querySelectorAll('input[name=fit]:checked')].map(e=>e.value),'textur/spänning'));
$('cancel').onclick=()=>{cancelled=true;status('Avbryter efter pågående modellutvärdering…');};
$('experiment').onclick=e=>{if(busy||!image)return;const b=e.target.getBoundingClientRect(),offset=(image.bin-1)/2;setFields({cx:(e.clientX-b.left)/b.width*image.width*image.bin+offset,cy:(e.clientY-b.top)/b.height*image.height*image.bin+offset});requestRender();};
for(const id of ['displayScale','showRings','residualRange'])$(id).onchange=()=>draw();
$('exportJSON').onclick=()=>{if(!last)return;download('debye-resultat.json',JSON.stringify({application:'Debye Lab 1',timestamp:new Date().toISOString(),data:{name:image.name,width:image.originalWidth,height:image.originalHeight,analysisWidth:image.width,analysisHeight:image.height,blockSize:image.bin,units:image.units,qualitative:!!image.qualitative,warning:image.warning||null},parameters:externalParams(last.p),cif:{name:cifName,text:cifText},metrics:last.fit,fit:fitRecord,limitations:'En fas, plan detektor, isotrop enaxlig elasticitet, kända E/nu, konstant bakgrund, ingen osäkerhetsanalys. Lokalt minimum; validera mot referens. Ingen kvantitativ textur från färglagda bilder.'},null,2),'application/json');};
$('exportCSV').onclick=()=>{if(!last)return;const r=radialProfiles(),lines=['two_theta_deg,experimental,calculated,residual,pixels'];for(let i=0;i<r.angles.length;i++)lines.push([r.angles[i],r.exp[i],r.calc[i],r.exp[i]-r.calc[i],r.count[i]].join(','));download('debye-radialprofiler.csv',lines.join('\n'),'text/csv');};
$('exportResidual').onclick=()=>{if(!last)return;const lines=[`# Signed residual in ${image.units||'data units'}; analysis ${image.width}x${image.height}; block=${image.bin}; NaN=masked`];for(let y=0;y<image.height;y++)lines.push(Array.from(last.residual.subarray(y*image.width,(y+1)*image.width)).join(','));download('debye-differens.csv',lines.join('\n'),'text/csv');};
$('exportPNG').onclick=()=>{if(!last)return;const a=document.createElement('a');a.download='debye-differens.png';a.href=$('difference').toDataURL('image/png');a.click();};
try{synthetic();}catch(e){error(e);}
// Narrow diagnostic interface for reproducible browser integration tests.
window.DebyeLab={get state(){return {image,crystal,last,fitRecord,busy};},calculate,uiParams,internalParams};
