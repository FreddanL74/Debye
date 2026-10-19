/* Debye Lab: shared browser/Node numerical model. No network dependencies. */
(function (root) {
'use strict';
const PI = Math.PI, RAD = PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = a => Math.hypot(...a);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function number(s) {
  if (s == null || s === '.' || s === '?') return NaN;
  return Number(String(s).replace(/\(\d+\)$/, ''));
}
function tokenizeCIF(s) {
  const tokens = []; let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === '#') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (s[i] === ';' && (i === 0 || s[i-1] === '\n')) {
      const end = s.indexOf('\n;', i+1);
      if (end < 0) throw Error('Oavslutat textfält i CIF.');
      tokens.push(s.slice(i+1,end)); i = end+2; continue;
    }
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i++], start = i;
      while (i < s.length && !(s[i] === q && (i+1 === s.length || /\s|#/.test(s[i+1])))) i++;
      if (i === s.length) throw Error('Oavslutad sträng i CIF.');
      tokens.push(s.slice(start,i++)); continue;
    }
    const start = i; while (i < s.length && !/\s/.test(s[i])) i++;
    tokens.push(s.slice(start,i));
  }
  return tokens;
}
// Evaluate only affine rational expressions. CIF text is never executed as JavaScript.
function symmetryOperation(s) {
  const parts = s.toLowerCase().replace(/\s/g,'').split(',');
  if (parts.length !== 3) throw Error('Ogiltig symmetrioperation: '+s);
  const rows = parts.map(part => {
    const terms = part.match(/[+-]?[^+-]+/g) || [];
    if (terms.join('') !== part) throw Error('Ogiltig symmetrioperation.');
    const c = [0,0,0,0];
    for (let t of terms) {
      let sign = 1; if (t[0] === '-') {sign=-1;t=t.slice(1);} else if(t[0]==='+') t=t.slice(1);
      if (/^[xyz]$/.test(t)) c['xyz'.indexOf(t)] += sign;
      else if (/^\d+(?:\.\d+)?(?:\/\d+)?$/.test(t)) {
        const [a,b='1'] = t.split('/'); if (+b === 0) throw Error('Noll i symmetrinämnare.'); c[3]+=sign*(+a)/(+b);
      } else throw Error('Symmetriuttryck stöds inte: '+t);
    }
    return c;
  });
  return p => rows.map(c => ((dot(c.slice(0,3),p)+c[3])%1+1)%1);
}
const FORM = {
 C:[[2.31,1.02,1.5886,.865],[20.8439,10.2075,.5687,51.6512],.2156],
 N:[[12.2126,3.1322,2.0125,1.1663],[.0057,9.8933,28.9975,.5826],-11.529],
 O:[[3.0485,2.2868,1.5463,.867],[13.2771,5.7011,.3239,32.9089],.2508],
 Ti:[[9.7595,7.3558,1.6991,1.9021],[7.8508,.5,35.6338,116.105],1.2807],
 W:[[29.0818,15.43,14.4327,5.11982],[1.72029,9.2259,.321703,57.056],9.8875]
};
function formFactor(el,s) {
  const c = FORM[el];
  if (!c) throw Error('Formfaktor saknas för '+el+'. Stöd finns för C, N, O, Ti och W.');
  return c[2]+c[0].reduce((sum,a,i)=>sum+a*Math.exp(-c[1][i]*s*s),0);
}
function cellBasis(cell) {
  const [a,b,c,al,be,ga] = cell, ca=Math.cos(al*RAD),cb=Math.cos(be*RAD),cg=Math.cos(ga*RAD),sg=Math.sin(ga*RAD);
  const v1=[a,0,0],v2=[b*cg,b*sg,0],z2=1-cb*cb-((ca-cb*cg)/sg)**2;
  if (!(a>0&&b>0&&c>0&&al>0&&al<180&&be>0&&be<180&&ga>0&&ga<180&&z2>1e-10)) throw Error('Ogiltig enhetscell.');
  const v3=[c*cb,c*(ca-cb*cg)/sg,c*Math.sqrt(z2)],vol=dot(v1,cross(v2,v3));
  return {direct:[v1,v2,v3], reciprocal:[cross(v2,v3),cross(v3,v1),cross(v1,v2)].map(v=>v.map(x=>x/vol))};
}
function parseCIF(text) {
  if (/\bdata_/i.test(text) && (text.match(/^\s*data_/gmi)||[]).length>1) throw Error('Välj en CIF med ett data_-block (en fas).');
  const t=tokenizeCIF(text),tags={},loops=[];let i=0;
  const control=s=>s && (s[0]==='_' || /^(loop_|stop_|data_|save_)/i.test(s));
  while(i<t.length) {
    const key=t[i++].toLowerCase();
    if(key==='loop_') {
      const keys=[];while(t[i]?.startsWith('_'))keys.push(t[i++].toLowerCase());
      if(!keys.length)throw Error('CIF-loop saknar kolumner.');
      const values=[];while(i<t.length&&!control(t[i]))values.push(t[i++]);
      if(values.length%keys.length)throw Error('CIF-loop har ofullständig rad.');
      loops.push({keys,rows:Array.from({length:values.length/keys.length},(_,j)=>values.slice(j*keys.length,(j+1)*keys.length))});
    } else if(key.startsWith('_')) { if(i===t.length)throw Error('CIF-värde saknas.');tags[key]=t[i++]; }
  }
  const cell=['length_a','length_b','length_c','angle_alpha','angle_beta','angle_gamma'].map(k=>number(tags['_cell_'+k]));
  if(!cell.every(Number.isFinite))throw Error('CIF måste innehålla a, b, c, α, β, γ.');
  const basis=cellBasis(cell),warnings=[];
  const atomLoop=loops.find(l=>l.keys.includes('_atom_site_fract_x'));
  if(!atomLoop)throw Error('CIF saknar atompositioner (_atom_site_fract_x/y/z).');
  const get=(row,k)=>row[atomLoop.keys.indexOf(k)];
  const opNames=['_space_group_symop_operation_xyz','_symmetry_equiv_pos_as_xyz'];
  let opStrings=[];
  for(const l of loops)for(const k of opNames)if(l.keys.includes(k))opStrings.push(...l.rows.map(r=>r[l.keys.indexOf(k)]));
  for(const k of opNames)if(tags[k])opStrings.push(tags[k]);
  const sg=number(tags['_space_group_it_number']??tags['_symmetry_int_tables_number']);
  if(!opStrings.length) {
    const name=(tags['_space_group_name_h-m_alt']||tags['_symmetry_space_group_name_h-m']||'').replace(/\s/g,'').toLowerCase();
    if(sg===1||(!Number.isFinite(sg)&&name==='p1'))opStrings=['x,y,z'];
    else throw Error('CIF behöver explicita symmetrioperationer. Exportera CIF med symmetri eller hela cellen som P1.');
  }
  if(opStrings.length>384)throw Error('För många symmetrioperationer.');
  const ops=opStrings.map(symmetryOperation),atoms=[];
  for(const row of atomLoop.rows) {
    const raw=get(row,'_atom_site_type_symbol')||get(row,'_atom_site_label')||'';
    const match=raw.match(/^([A-Z][a-z]?)/);if(!match||!FORM[match[1]])throw Error('Atomtyp stöds inte: '+raw+' (C, N, O, Ti, W stöds).');
    const el=match[1],p=['x','y','z'].map(k=>number(get(row,'_atom_site_fract_'+k)));
    if(!p.every(Number.isFinite))throw Error('Ogiltiga fraktionella atomkoordinater.');
    const occRaw=get(row,'_atom_site_occupancy'),occ=occRaw==null?1:number(occRaw);
    if(!Number.isFinite(occ)||occ<0||occ>1)throw Error('Ogiltig beläggningsgrad.');
    let B=number(get(row,'_atom_site_b_iso_or_equiv'));
    if(!Number.isFinite(B)){const u=number(get(row,'_atom_site_u_iso_or_equiv'));B=Number.isFinite(u)?8*PI*PI*u:0;}
    if(B<0)throw Error('Negativ temperaturfaktor stöds inte.');
    const seen=new Set();for(const op of ops){const xyz=op(p),key=xyz.map(x=>(Math.round(x*1e6)%1000000)).join(',');if(!seen.has(key)){seen.add(key);atoms.push({el,p:xyz,occ,B});}}
  }
  if(!atoms.length||atoms.length>2000)throw Error('Antalet atomer i cellen måste vara 1–2000.');
  if(atomLoop.keys.some(k=>k.includes('aniso')))warnings.push('Anisotropa temperaturfaktorer används inte.');
  return {name:tags['_chemical_formula_sum']||tags['_chemical_name_common']||'Importerad CIF',cell,basis,atoms,warnings};
}
function reciprocalVector(crystal,hkl){return [0,1,2].map(j=>hkl.reduce((s,h,i)=>s+h*crystal.basis.reciprocal[i][j],0));}
function reflections(crystal,qmax,axis=[1,0,0]) {
  if(!axis.every(Number.isFinite)||norm(axis)<1e-12)throw Error('Texturriktningen får inte vara [0 0 0].');
  const axisVec=[0,1,2].map(j=>axis.reduce((s,a,i)=>s+a*crystal.basis.direct[i][j],0)),an=norm(axisVec);
  if(!(qmax>0&&Number.isFinite(qmax)))throw Error('Ogiltigt q-intervall.');
  const bounds=crystal.cell.slice(0,3).map(a=>Math.ceil(qmax*a/(2*PI)));
  if(bounds.some(n=>n>36)||bounds.reduce((p,n)=>p*(2*n+1),1)>200000)throw Error('För stor cell/q-intervall för webbläsaren. Minska q-max.');
  const groups=new Map();
  for(let h=-bounds[0];h<=bounds[0];h++)for(let k=-bounds[1];k<=bounds[1];k++)for(let l=-bounds[2];l<=bounds[2];l++) {
    if(!h&&!k&&!l)continue;
    const v=reciprocalVector(crystal,[h,k,l]),g=norm(v),q=2*PI*g;if(q>qmax+1e-9)continue;
    let re=0,im=0;const ff={};
    for(const a of crystal.atoms){const f=(ff[a.el]??(ff[a.el]=formFactor(a.el,g/2)))*a.occ*Math.exp(-a.B*(g/2)**2),ph=2*PI*(h*a.p[0]+k*a.p[1]+l*a.p[2]);re+=f*Math.cos(ph);im+=f*Math.sin(ph);}
    const f2=re*re+im*im;if(f2<1e-8)continue;
    const key=q.toFixed(7);let r=groups.get(key);
    if(!r){r={q,d:1/g,hkl:[h,k,l],strength:0,gammas:new Map(),multiplicity:0};groups.set(key,r);}
    r.strength+=f2;r.multiplicity++;
    const cg=clamp(Math.abs(dot(v,axisVec)/(g*an)),0,1),cgKey=cg.toFixed(7),old=r.gammas.get(cgKey);
    r.gammas.set(cgKey,{cg,weight:(old?.weight||0)+f2});
    // Prefer a positive conventional label, independently of texture integration.
    const label=[h,k,l];if(label.every(x=>x>=0)&&label[0]>=r.hkl[0])r.hkl=label;
  }
  const result=[...groups.values()].sort((a,b)=>a.q-b.q);
  const max=Math.max(0,...result.map(r=>r.strength));
  return result.filter(r=>r.strength>max*1e-9).map(r=>({...r,gammas:[...r.gammas.values()].map(g=>({...g,weight:g.weight/r.strength}))}));
}
function thetaStress(ring,phi,p){
  let theta=Math.asin(p.lambda/(2*ring.d));
  for(let i=0;i<5;i++){
    const u=Math.cos(theta)*Math.cos(phi-p.stressAngle*RAD),strain=p.stress/p.E*((1+p.nu)*u*u-p.nu),s=p.lambda/(2*ring.d*(1+strain));
    if(!(s>0&&s<Math.SQRT1_2))return NaN;theta=Math.asin(s);
  }
  return theta;
}
function marchDollase(r,c){return (r*r*c*c+(1-c*c)/r)**-1.5;}
function texture(ring,phi,p,steps=64){
  if(Math.abs(p.r-1)<1e-10)return 1;
  const th=Math.asin(p.lambda/(2*ring.d)),ce=Math.cos(th)*Math.cos(phi-p.textureAngle*RAD),se=Math.sqrt(Math.max(0,1-ce*ce));
  let total=0;
  for(const {cg,weight}of ring.gammas){const sg=Math.sqrt(Math.max(0,1-cg*cg));let sum=0;
    for(let i=0;i<steps;i++)sum+=marchDollase(p.r,clamp(cg*ce+sg*se*Math.cos(2*PI*i/steps),-1,1));
    total+=weight*sum/steps;
  }return total;
}
function validateParams(p){
  for(const key of ['cx','cy','pixel','distance','lambda','fwhm','r','stress','stressAngle','textureAngle','E','nu','qmax','maskInner','maskOuter'])if(!Number.isFinite(p[key]))throw Error('Ogiltigt parametervärde: '+key);
  if(!(p.pixel>0&&p.distance>0&&p.lambda>0&&p.fwhm>0&&p.r>=.1&&p.r<=10&&p.E>0&&p.nu>-.99&&p.nu<.5&&p.maskInner>=0&&p.maskOuter>p.maskInner))throw Error('Kontrollera positiva mått, toppbredd, E, r och maskradier (yttre > inre). ν måste ligga mellan −0,99 och 0,5.');
  if(p.lambdaBounds&&(!Array.isArray(p.lambdaBounds)||p.lambdaBounds.length!==2||!p.lambdaBounds.every(Number.isFinite)||p.lambdaBounds[0]>=p.lambdaBounds[1]||p.lambda<p.lambdaBounds[0]||p.lambda>p.lambdaBounds[1]))throw Error('Våglängden ligger utanför det angivna intervallet.');
  if(Math.abs(p.stress/p.E)>.04)throw Error('|σ/E| får vara högst 0,04 i denna linjärelastiska modell.');
}
// Empirical correction from the WC viewer, anchored at the crystal's (001) q.
// q is the unstrained reflection q, so beta does not change the stress law.
function ringRadius(ring,p,theta=Math.asin(p.lambda/(2*ring.d))){
  const beta=p.beta??0;
  if(!Number.isFinite(beta)||Math.abs(beta)>.04)throw Error('β måste ligga mellan −0,04 och 0,04.');
  if(beta!==0&&!(Number.isFinite(p.betaQref)&&p.betaQref>0))throw Error('Referens-q för β saknas.');
  const factor=beta===0?1:1+beta*((ring.q/p.betaQref)**2-1);
  if(!(factor>0))throw Error('β ger en ogiltig ringradie. Minska |β| eller q-max.');
  return p.distance*Math.tan(2*theta)*factor;
}
function modelTables(rings,p,az=180){
  validateParams(p);
  const tables=[];let max=0;
  for(const ring of rings){
    if(p.lambda/(2*ring.d)>=Math.SQRT1_2)continue;
    const centers=new Float64Array(az+1),strengths=new Float64Array(az+1);
    for(let j=0;j<az;j++){
      const phi=2*PI*j/az,th=thetaStress(ring,phi,p),tt=2*th;
      centers[j]=Math.atan2(ringRadius(ring,p,th),p.distance)/RAD;
      // Powder Lorentz x polarization x planar-detector solid-angle conversion.
      const pol=p.polarized?1-Math.sin(tt)**2*Math.cos(phi)**2:(1+Math.cos(tt)**2)/2;
      strengths[j]=ring.strength*pol*texture(ring,phi,p)/(Math.sin(th)*Math.sin(tt)) /(Math.tan(tt)/Math.cos(tt)**2);
      max=Math.max(max,strengths[j]);
    }
    centers[az]=centers[0];strengths[az]=strengths[0];tables.push({ring,centers,strengths});
  }
  for(const t of tables)for(let j=0;j<=az;j++)t.strengths[j]/=max||1;
  return {tables,az};
}
function intensity(x,y,p,model){
  const dx=(x-p.cx)*p.pixel,dy=(p.cy-y)*p.pixel,rad=Math.hypot(dx,dy),tt=Math.atan2(rad,p.distance)/RAD;
  let f=(Math.atan2(dy,dx)+2*PI)%(2*PI)*model.az/(2*PI),j=Math.floor(f);f-=j;
  let sum=0;for(const t of model.tables){const c=t.centers[j]*(1-f)+t.centers[j+1]*f,z=(tt-c)/p.fwhm;if(Math.abs(z)>3)continue;sum+=(t.strengths[j]*(1-f)+t.strengths[j+1]*f)*Math.exp(-4*Math.LN2*z*z);}
  return sum;
}
function validPixel(image,x,y,p){const rad=Math.hypot(x-p.cx,y-p.cy);return rad>=p.maskInner&&rad<=p.maskOuter;}
function samples(image,p,max=14000){
  const points=[],step=Math.max(1,Math.ceil(Math.sqrt(image.width*image.height/max)));
  for(let y=0;y<image.height;y+=step)for(let x=0;x<image.width;x+=step){const v=image.data[y*image.width+x];if(Number.isFinite(v)&&validPixel(image,x,y,p))points.push([x,y,v]);}
  if(points.length<30)throw Error('För få omaskerade datapunkter (minst 30 behövs).');return points;
}
// Solve the nonnegative diffraction scale and optional constant background in original data units.
function scaleModel(values,points,background=true){
  let n=values.length,sx=0,sy=0,sxx=0,sxy=0;for(let i=0;i<n;i++){let x=values[i],y=points[i][2];sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
  const den=background?sxx-sx*sx/n:sxx;
  const a=Math.max(0,den>1e-20?(background?sxy-sx*sy/n:sxy)/den:0),b=background?(sy-a*sx)/n:0;
  let sse=0,energy=0;for(let i=0;i<n;i++){sse+=(points[i][2]-a*values[i]-b)**2;energy+=points[i][2]**2;}
  return {a,b,sse,rmse:Math.sqrt(sse/n),rwp:Math.sqrt(sse/(energy||1)),n};
}
function evaluate(points,rings,p){const model=modelTables(rings,p),values=Float64Array.from(points,pt=>intensity(pt[0],pt[1],p,model));return {...scaleModel(values,points,p.background),model};}
function render(image,rings,p){
  const pts=samples(image,p,24000),fit=evaluate(pts,rings,p),calculated=new Float32Array(image.data.length),residual=new Float32Array(image.data.length),mask=new Uint8Array(image.data.length);
  let sse=0,energy=0,n=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const i=y*image.width+x,ok=Number.isFinite(image.data[i])&&validPixel(image,x,y,p);mask[i]=ok?1:0;
    calculated[i]=fit.a*intensity(x,y,p,fit.model)+fit.b;
    residual[i]=ok?image.data[i]-calculated[i]:NaN;
    if(ok){sse+=residual[i]**2;energy+=image.data[i]**2;n++;}
  }
  return {calculated,residual,mask,fit:{...fit,model:undefined,rmse:Math.sqrt(sse/n),rwp:Math.sqrt(sse/(energy||1)),n}};
}
function bilinear(image,x,y){
  if(x<0||y<0||x>=image.width-1||y>=image.height-1)return NaN;
  const a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b,i=b*image.width+a,d=image.data;
  return d[i]*(1-fx)*(1-fy)+d[i+1]*fx*(1-fy)+d[i+image.width]*(1-fx)*fy+d[i+image.width+1]*fx*fy;
}
async function findCenter(image,p,onProgress=()=>{},cancel=()=>false){
  // Gradient normals intersect at the ring centre. Refine by 180-degree image symmetry.
  const step=Math.max(1,Math.floor(Math.max(image.width,image.height)/350));let aa=0,ab=0,bb=0,at=0,bt=0;
  for(let y=step;y<image.height-step;y+=step)for(let x=step;x<image.width-step;x+=step){
    if(!validPixel(image,x,y,p))continue;
    const gx=bilinear(image,x+step,y)-bilinear(image,x-step,y),gy=bilinear(image,x,y+step)-bilinear(image,x,y-step),g=Math.hypot(gx,gy);
    if(!Number.isFinite(g)||g<1e-10)continue;
    const a=-gy/g,b=gx/g,w=g;aa+=w*a*a;ab+=w*a*b;bb+=w*b*b;at+=w*a*(a*x+b*y);bt+=w*b*(a*x+b*y);
  }
  const det=aa*bb-ab*ab;if(!(det>1e-12))throw Error('Centrum kunde inte bestämmas: inga tydliga ringgradienter.');
  const guess=[(at*bb-bt*ab)/det,(bt*aa-at*ab)/det];
  if(guess[0]<0||guess[1]<0||guess[0]>=image.width||guess[1]>=image.height)throw Error('Centrumskattning utanför bilden. Välj centrum manuellt.');
  const stride=Math.max(2,Math.ceil(Math.sqrt(image.width*image.height/12000))),coords=[];
  for(let y=stride;y<image.height-stride;y+=stride)for(let x=stride;x<image.width-stride;x+=stride)if(validPixel(image,x,y,p)&&Number.isFinite(image.data[y*image.width+x]))coords.push([x,y,image.data[y*image.width+x]]);
  function loss(cx,cy){let sum=0,n=0;for(const [x,y,v]of coords){const xx=2*cx-x,yy=2*cy-y;if(!validPixel(image,xx,yy,{...p,cx,cy}))continue;const u=bilinear(image,xx,yy);if(Number.isFinite(u)){sum+=(v-u)**2;n++;}}return n>coords.length*.4?sum/n:Infinity;}
  const starts=[guess,[p.cx,p.cy]],best=starts.map(c=>({c,loss:loss(...c)})).sort((a,b)=>a.loss-b.loss)[0];
  let [cx,cy]=best.c,score=best.loss;
  for(let delta=Math.max(2,Math.min(image.width,image.height)/80);delta>=.04;delta/=2){
    for(let iter=0;iter<12;iter++){
      if(cancel())throw Error('Avbruten.');let changed=false;
      for(const [dx,dy]of [[-delta,0],[delta,0],[0,-delta],[0,delta]]){const value=loss(cx+dx,cy+dy);if(value<score){cx+=dx;cy+=dy;score=value;changed=true;}}
      if(!changed)break;
    }
    onProgress({cx,cy,score});await new Promise(r=>setTimeout(r,0));
  }
  return {cx,cy,score};
}
async function optimize(image,rings,p,keys,onProgress=()=>{},cancel=()=>false){
  if(!keys.length)throw Error('Välj minst en parameter att anpassa.');
  if(keys.includes('lambda')&&keys.includes('distance'))throw Error('Lås λ eller avståndet. De är starkt korrelerade, särskilt vid små vinklar.');
  const points=samples(image,p,10000),current={...p},bounds={distance:[1,100000],lambda:p.lambdaBounds||[.01,5],cx:[0,image.width-1],cy:[0,image.height-1],r:[.1,10],textureAngle:[-360,540],stress:[-Math.min(10000,p.E*.039),Math.min(10000,p.E*.039)],stressAngle:[-360,540],fwhm:[.002,2]},steps={distance:p.distance*.015,lambda:p.lambda*.015,cx:.5,cy:.5,r:.2,textureAngle:12,stress:400,stressAngle:12,fwhm:p.fwhm*.25};
  let best=evaluate(points,rings,current),evaluations=1,iteration=0;
  const score=q=>{try{return evaluate(points,rings,q);}catch{return {sse:Infinity};}};
  // Multiple angular starts avoid the zero-stress / r=1 flat directions.
  if(keys.includes('stress')&&keys.includes('stressAngle'))for(const stress of [-800,800])for(const angle of [0,45,90,135]){if(cancel())throw Error('Avbruten.');const trial={...current,stress:clamp(stress,...bounds.stress),stressAngle:angle},v=score(trial);evaluations++;if(v.sse<best.sse){Object.assign(current,trial);best=v;}await new Promise(r=>setTimeout(r,0));}
  if(keys.includes('r')&&keys.includes('textureAngle'))for(const r of [.6,1.6])for(const angle of [0,45,90,135]){if(cancel())throw Error('Avbruten.');const trial={...current,r,textureAngle:angle},v=score(trial);evaluations++;if(v.sse<best.sse){Object.assign(current,trial);best=v;}await new Promise(r=>setTimeout(r,0));}
  for(let level=0;level<9;level++)for(let sweep=0;sweep<10;sweep++){
    let improved=false;
    for(const key of keys){
      if(cancel())throw Error('Avbruten.');
      let local=current[key],candidate=best;
      for(const sign of [-1,1]){
        const value=clamp(current[key]+sign*steps[key]/2**level,...bounds[key]);
        if(value===current[key])continue;const v=score({...current,[key]:value});evaluations++;
        if(v.sse<candidate.sse){candidate=v;local=value;}
      }
      if(local!==current[key]){current[key]=local;best=candidate;improved=true;}
    }
    iteration++;onProgress({p:{...current},fit:best,iteration,evaluations});await new Promise(r=>setTimeout(r,0));if(!improved)break;
  }
  current.stressAngle=((current.stressAngle%180)+180)%180;current.textureAngle=((current.textureAngle%180)+180)%180;
  return {p:current,fit:best,evaluations,iterations:iteration};
}
function parseMatrix(text){
  const rows=text.trim().split(/\r?\n/).filter(s=>s.trim()&&!s.trim().startsWith('#')).map(s=>s.trim().split(/[;,\s]+/).map(v=>/^(nan|\?)$/i.test(v)?NaN:Number(v)));
  if(!rows.length||!rows[0].length||rows.some(r=>r.length!==rows[0].length)||rows.some(r=>r.some(v=>!Number.isFinite(v)&&!Number.isNaN(v))))throw Error('Ogiltig rektangulär intensitetsmatris.');
  // Reject arbitrary words instead of silently accepting them as masked NaNs.
  for(const line of text.trim().split(/\r?\n/).filter(s=>s.trim()&&!s.trim().startsWith('#')))for(const v of line.trim().split(/[;,\s]+/))if(!/^(nan|\?)$/i.test(v)&&!Number.isFinite(Number(v)))throw Error('Matrisen får bara innehålla tal eller NaN för maskerade pixlar.');
  if(rows.length*rows[0].length>17000000)throw Error('Bilden är för stor (högst 17 miljoner pixlar).');
  return {width:rows[0].length,height:rows.length,data:Float32Array.from(rows.flat())};
}
function readTIFF(buffer){
  const v=new DataView(buffer),le=v.getUint16(0,false)===0x4949;
  if(!(le||v.getUint16(0,false)===0x4d4d)||v.getUint16(2,le)!==42)throw Error('Endast klassisk TIFF stöds.');
  const off=v.getUint32(4,le),count=v.getUint16(off,le),tags={};
  for(let i=0;i<count;i++){
    const p=off+2+i*12,tag=v.getUint16(p,le),type=v.getUint16(p+2,le),n=v.getUint32(p+4,le),size={1:1,3:2,4:4}[type];if(!size)continue;
    const start=n*size<=4?p+8:v.getUint32(p+8,le),a=[];if(n>17000000)throw Error('För stor TIFF-tagg.');
    for(let j=0;j<n;j++)a.push(type===1?v.getUint8(start+j):type===3?v.getUint16(start+j*2,le):v.getUint32(start+j*4,le));tags[tag]=a;
  }
  const one=(t,d)=>tags[t]?.[0]??d,w=one(256),h=one(257),bits=one(258,8),compression=one(259,1),channels=one(277,1),format=one(339,1),orientation=one(274,1),photo=one(262,1);
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>17000000)throw Error('Ogiltig TIFF-storlek.');
  if(compression!==1||channels!==1||![8,16,32].includes(bits)||![1,2,3].includes(format)||orientation!==1||photo!==1||(format===3&&bits!==32))throw Error('TIFF: välj okomprimerad gråskala, svart=0, orientering 1; 8/16/32-bit heltal eller 32-bit float. Konvertera annars till CSV.');
  if(tags[324]||!tags[273]||!tags[279])throw Error('Kaklad TIFF stöds inte; använd strips eller CSV.');
  const data=new Float32Array(w*h),rps=one(278,h),bytes=bits/8;
  for(let row=0;row<h;row++)for(let x=0;x<w;x++){
    const strip=Math.floor(row/rps),within=((row%rps)*w+x)*bytes,pos=tags[273][strip]+within;
    if(within+bytes>tags[279][strip])throw Error('Ofullständig TIFF-strip.');
    data[row*w+x]=format===3?v.getFloat32(pos,le):format===2?(bits===8?v.getInt8(pos):bits===16?v.getInt16(pos,le):v.getInt32(pos,le)):(bits===8?v.getUint8(pos):bits===16?v.getUint16(pos,le):v.getUint32(pos,le));
  }
  return {width:w,height:h,data};
}
const WC_CIF=`data_WC_full_cell
_chemical_formula_sum 'W C'
_cell_length_a 2.9054
_cell_length_b 2.9054
_cell_length_c 2.84015
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 120
_space_group_IT_number 1
_space_group_name_H-M_alt 'P 1'
loop_
_space_group_symop_operation_xyz
'x,y,z'
loop_
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
W 0 0 0
C 0.333333333333 0.666666666667 0.5
`;
const TIN_CIF=`data_TiN_full_cell
_chemical_formula_sum 'Ti N'
_cell_length_a 4.4
_cell_length_b 4.4
_cell_length_c 4.4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_space_group_IT_number 1
loop_
_space_group_symop_operation_xyz
'x,y,z'
loop_
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Ti 0 0 0
Ti 0 0.5 0.5
Ti 0.5 0 0.5
Ti 0.5 0.5 0
N 0.5 0.5 0.5
N 0.5 0 0
N 0 0.5 0
N 0 0 0.5
`;
const api={RAD,clamp,parseCIF,tokenizeCIF,symmetryOperation,cellBasis,reciprocalVector,reflections,formFactor,thetaStress,ringRadius,marchDollase,texture,modelTables,intensity,samples,scaleModel,evaluate,render,findCenter,optimize,parseMatrix,readTIFF,validateParams,WC_CIF,TIN_CIF};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Debye=api;
})(typeof globalThis!=='undefined'?globalThis:this);
