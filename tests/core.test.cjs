'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),D=require('../debye-core.js');
const near=(actual,expected,tol=1e-8)=>assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected} ± ${tol}`);
const params={cx:63.4,cy:62.7,pixel:.5,distance:110,lambda:.2,fwhm:.16,r:.7,textureAngle:65,stress:1600,stressAngle:35,E:450000,nu:.2,qmax:7,maskInner:6,maskOuter:85,axis:[1,0,0],background:true,polarized:true};
function fixture(p=params){const crystal=D.parseCIF(D.TIN_CIF),rings=D.reflections(crystal,p.qmax,p.axis),model=D.modelTables(rings,p),width=128,height=128,data=new Float32Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=1.7*D.intensity(x,y,p,model)+.04;return {crystal,rings,image:{width,height,data}};}
test('TiN cell gives independent FCC extinctions, d111 and multiplicities',()=>{
 const c=D.parseCIF(D.TIN_CIF),r=D.reflections(c,9);assert.equal(c.atoms.length,8);near(r[0].d,4.4/Math.sqrt(3));assert.equal(r[0].multiplicity,8);assert.equal(r[1].multiplicity,6);
 for(const ring of r){const parity=ring.hkl.map(x=>Math.abs(x)%2);assert.ok(parity.every(x=>x===parity[0]));}
});
test('WC hexagonal reciprocal metric agrees with analytic d(hkl)',()=>{
 const c=D.parseCIF(D.WC_CIF);
 for(const hkl of [[0,0,1],[1,0,0],[1,1,2],[2,-1,3]]){const [h,k,l]=hkl,invD=Math.sqrt(4*(h*h+h*k+k*k)/(3*2.9054**2)+l*l/2.84015**2);near(Math.hypot(...D.reciprocalVector(c,hkl)),invD);}
});
test('CIF uncertainty notation, symmetry deduplication and occupancy',()=>{
 const cif=D.WC_CIF.replace('2.9054','2.9054(2)').replace("'x,y,z'","'x,y,z'\n'-x,-y,-z'");const c=D.parseCIF(cif);assert.equal(c.atoms.filter(a=>a.el==='W').length,1);assert.equal(c.atoms.filter(a=>a.el==='C').length,2);near(c.cell[0],2.9054);
});
test('unsupported/ambiguous CIF fails, symmetry cannot execute code',()=>{
 assert.throws(()=>D.parseCIF(D.WC_CIF.replace("_space_group_IT_number 1","_space_group_IT_number 187").replace("loop_\n_space_group_symop_operation_xyz\n'x,y,z'\n",'')),/symmetri/);
 assert.throws(()=>D.symmetryOperation('x,y,alert(1)'),/stöds/);
 assert.throws(()=>D.parseCIF(D.WC_CIF.replace('W 0 0 0','Fe 0 0 0')),/stöds/);
 assert.throws(()=>D.parseCIF(D.TIN_CIF+'\ndata_other'),/data_/);
});
test('March–Dollase limits and isotropic distribution',()=>{
 near(D.marchDollase(.5,1),8);near(D.marchDollase(.5,0),.5**1.5);const c=D.parseCIF(D.TIN_CIF),r=D.reflections(c,6)[0];for(const a of [0,.3,1.5])near(D.texture(r,a,{...params,r:1}),1);
});
test('stress shifts lattice spacing with independently reconstructed strain',()=>{
 const ring=D.reflections(D.parseCIF(D.TIN_CIF),6)[0],p={...params,stressAngle:0};
 for(const phi of [0,Math.PI/2]){const th=D.thetaStress(ring,phi,p),eps=p.stress/p.E*((1+p.nu)*(Math.cos(th)*Math.cos(phi))**2-p.nu);near(p.lambda/(2*Math.sin(th)),ring.d*(1+eps),1e-9);}
 assert.ok(D.thetaStress(ring,0,p)<D.thetaStress(ring,0,{...p,stress:0}));
});
test('common scale/background yield near-zero residual on synthetic intensities',()=>{
 const {rings,image}=fixture(),out=D.render(image,rings,params);near(out.fit.a,1.7,2e-6);near(out.fit.b,.04,2e-7);assert.ok(out.fit.rmse<1e-7);assert.ok(out.fit.rwp<1e-6);
 const wrong=D.render(image,rings,{...params,stress:0,r:1});assert.ok(wrong.fit.rmse>.003);const i=0;assert.ok(Number.isNaN(out.residual[i]));
});
test('invalid pixels and radial masks never enter the objective',()=>{
 const {rings,image}=fixture();image.data[50*128+60]=NaN;const out=D.render(image,rings,params);assert.equal(out.mask[50*128+60],0);assert.ok(Number.isNaN(out.residual[50*128+60]));assert.ok(Number.isFinite(out.fit.rmse));
});
test('center search recovers off-centre synthetic rings',async()=>{
 const truth={...params,r:1,stress:0,fwhm:.28},f=fixture(truth),c=await D.findCenter(f.image,{...truth,cx:64,cy:64});near(c.cx,truth.cx,.2);near(c.cy,truth.cy,.2);
});
test('fit recovers planted March–Dollase and stress with known geometry',async()=>{
 const f=fixture(),start={...params,r:.9,stress:700,textureAngle:60,stressAngle:25};const result=await D.optimize(f.image,f.rings,start,['r','textureAngle','stress','stressAngle']);near(result.p.r,params.r,.025);near(result.p.stress,params.stress,80);near(result.p.textureAngle,params.textureAngle,3);near(result.p.stressAngle,params.stressAngle,3);assert.ok(result.fit.rwp<.01);
});
test('geometry fit recovers a known detector distance with fixed wavelength',async()=>{
 const f=fixture({...params,r:1,stress:0}),p={...params,r:1,stress:0,distance:108};const result=await D.optimize(f.image,f.rings,p,['distance']);near(result.p.distance,110,.05);
 await assert.rejects(()=>D.optimize(f.image,f.rings,p,['lambda','distance']),/Lås/);
});
test('numeric matrix preserves negative values and NaN mask; rejects nonnumeric input',()=>{
 const m=D.parseMatrix('1,2,NaN\n-2,0,3');assert.equal(m.width,3);assert.equal(m.height,2);assert.ok(Number.isNaN(m.data[2]));assert.equal(m.data[3],-2);assert.throws(()=>D.parseMatrix('1,foo\n2,3'),/bara/);assert.throws(()=>D.parseMatrix('1,2\n3'),/rektangulär/);
});
function tiffFixture(le=true,float=false){
 const tags=[[256,4,3],[257,4,2],[258,3,float?32:16],[259,3,1],[262,3,1],[273,4,0],[277,3,1],[278,4,2],[279,4,6*(float?4:2)],[339,3,float?3:1]],start=8+2+tags.length*12+4,buf=new ArrayBuffer(start+6*(float?4:2)),v=new DataView(buf);v.setUint16(0,le?0x4949:0x4d4d,false);v.setUint16(2,42,le);v.setUint32(4,8,le);v.setUint16(8,tags.length,le);
 tags[5][2]=start;tags.forEach(([tag,type,value],i)=>{const p=10+i*12;v.setUint16(p,tag,le);v.setUint16(p+2,type,le);v.setUint32(p+4,1,le);if(type===3)v.setUint16(p+8,value,le);else v.setUint32(p+8,value,le);});for(let i=0;i<6;i++)if(float)v.setFloat32(start+i*4,i-.5,le);else v.setUint16(start+i*2,1000+i,le);return buf;
}
test('TIFF decodes 16-bit little/big endian and 32-bit float without canvas quantization',()=>{
 for(const le of [true,false]){const a=D.readTIFF(tiffFixture(le));assert.equal(a.width,3);assert.equal(a.height,2);assert.equal(a.data[5],1005);const b=D.readTIFF(tiffFixture(le,true));near(b.data[0],-.5);near(b.data[5],4.5);}
 const compressed=tiffFixture();new DataView(compressed).setUint16(10+3*12+8,5,true);assert.throws(()=>D.readTIFF(compressed),/okomprimerad/);
});

test('wavelength fit respects user calibration bounds',async()=>{
 const p={...params,r:1,stress:0,lambda:.185,lambdaBounds:[.17,.2]},f=fixture(p),result=await D.optimize(f.image,f.rings,{...p,lambda:.18},['lambda']);near(result.p.lambda,.185,.0001);assert.ok(result.p.lambda>=.17&&result.p.lambda<=.2);assert.throws(()=>D.modelTables(f.rings,{...p,lambda:.16}),/intervallet/);
});

test('WC beta preserves (001) and shifts outer rings by the original radial formula',()=>{
 const c=D.parseCIF(D.WC_CIF),rings=D.reflections(c,11),p={...params,lambda:.2,beta:0,betaQref:2*Math.PI/c.cell[2]},first=rings[0],outer=rings.find(r=>r.q>5);
 const r0=D.ringRadius(first,p),rOuter=D.ringRadius(outer,p);
 for(const beta of [-.02,.02]){near(D.ringRadius(first,{...p,beta}),r0);near(D.ringRadius(outer,{...p,beta}),rOuter*(1+beta*((outer.q/p.betaQref)**2-1)));}
 const t0=D.modelTables(rings,p),t1=D.modelTables(rings,{...p,beta:.02});near(t0.tables[0].centers[0],t1.tables[0].centers[0]);assert.ok(t1.tables[3].centers[0]>t0.tables[3].centers[0]);
 assert.throws(()=>D.ringRadius(outer,{...p,beta:.05}),/β/);assert.throws(()=>D.ringRadius(outer,{...p,beta:-.04,betaQref:.01}),/ringradie/);
});
test('changing centre translates the calculated signal without modifying experimental data',()=>{
 const f=fixture(),p=params,model=D.modelTables(f.rings,p),dx=2,dy=-3;
 for(const [x,y]of [[30,45],[90,65],[72,27]])near(D.intensity(x,y,p,model),D.intensity(x+dx,y+dy,{...p,cx:p.cx+dx,cy:p.cy+dy},model));
});
