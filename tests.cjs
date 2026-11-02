// node tests.cjs — checks teaching content against the page's own engine.
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const block=n=>{const m=html.match(new RegExp('/\\*'+n+'-START\\*/([\\s\\S]*?)/\\*'+n+'-END\\*/'));if(!m)throw new Error('missing block '+n);return m[1];};
const ctx=vm.createContext({});
vm.runInContext(`let D,P;${block('ENGINE-DX')}${block('ENGINE-PV')}${block('CASES')}${block('QUIZ')}${block('MAP')}
const dxS=st=>({rf:[],n:1,dur:'e',loc:'uni',qual:'puls',sev:2,aggr:0,assoc:[],aura:false,auraT:[],auraF:[],auto:[],orb:false,cfreq:false,mhd:0,mmd:0,months:0,simple:0,spec:0,...st,rf:new Set(st.rf||[]),assoc:new Set(st.assoc||[]),auraT:new Set(st.auraT||[]),auraF:new Set(st.auraF||[]),auto:new Set(st.auto||[])});
const pvS=st=>({type:'em',mhd:0,mmd:0,months:0,h4:1,dis:0,wk2:false,special:false,life:false,spec:'neuro',app:'new',cert:false,onbtx:false,oncgrp:false,base:0,now:0,gap:0,...st,fails:new Set(st.fails||[])});
globalThis.dx=st=>{D=dxS(st);return ichd();};
globalThis.pv=st=>{P=pvS(st);return evalPv();};
globalThis.ahs=(m,d)=>ahsPrev(m,d)[0];
globalThis.T={CASES,QUIZ,MAP};`,ctx);
const {dx,pv,ahs,T}=ctx;
let pass=0,fail=0;
const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('FAIL',m);}};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const codes=st=>[...dx(st).res].map(r=>r.code);

// AHS 2021 Table 4, every row and its neighbours.
[[6,0,'應提供預防治療'],[4,1,'應提供預防治療'],[3,2,'應提供預防治療'],[5,0,'可考慮預防治療'],[4,0,'可考慮預防治療'],[3,1,'可考慮預防治療'],[2,2,'可考慮預防治療'],[3,0,'目前不需預防治療'],[2,1,'目前不需預防治療'],[1,2,'目前不需預防治療']].forEach(([m,d,v])=>eq(ahs(m,d),v,`AHS ${m} days, disability ${d}`));

// ICHD-3 thresholds the quiz teaches.
const mig={n:10,dur:'e',loc:'uni',qual:'puls',sev:3,aggr:1,assoc:['nausea','photo','phono']};
eq(codes({...mig,n:5}),['1.1'],'1.1 at 5 attacks');
ok(!codes({...mig,n:2}).includes('1.1'),'1.1 not at 2-4 attacks');
const cm={...mig,mhd:15,mmd:8,months:4};
eq(codes(cm),['1.3'],'1.3 at 15/8 days');
ok(!codes({...cm,mmd:7}).includes('1.3'),'1.3 needs 8 migraine days');
ok(!codes({...cm,mhd:14}).includes('1.3'),'1.3 needs 15 headache days');
ok(codes({...cm,spec:10}).includes('8.2'),'8.2 at triptan 10 days');
ok(!codes({...cm,spec:9}).includes('8.2'),'8.2 not at triptan 9 days');
ok(codes({...cm,simple:15}).includes('8.2'),'8.2 at simple analgesic 15 days');
ok(!codes({...cm,simple:14}).includes('8.2'),'8.2 not at simple analgesic 14 days');
const aura={...mig,n:2,aura:true,auraT:['vis'],auraF:['spread','unil','pos']};
eq(codes(aura),['1.2.1'],'1.2.1 at 3 of 6 features');
ok(!codes({...aura,auraF:['spread','unil']}).includes('1.2.1'),'1.2 needs 3 features');
ok(dx({...mig,rf:['thunder']}).res.length===0,'red flag blocks primary diagnosis');

// NHI rules the cases and quiz teach.
const nhi={type:'cm',mhd:22,mmd:10,months:8,h4:1,fails:['prop','topi','flun'],spec:'neuro',app:'new',cert:true};
ok(pv(nhi).okC&&pv(nhi).okB,'first application eligible');
ok(!pv({...nhi,fails:['prop','flun','ami']}).okC,'topiramate is required');
ok(!pv({...nhi,fails:['prop','topi']}).okC,'3 failures are required');
ok(!pv({...nhi,mhd:14}).okC,'episodic is not eligible');
ok(!pv({...nhi,spec:'other'}).okC,'specialty is required');
ok(!pv({...nhi,onbtx:true}).okC&&!pv({...nhi,oncgrp:true}).okB,'no combination');
const cont={...nhi,app:'cont',base:20,now:10};
ok(pv(cont).okC,'continuation at exactly 50%');
ok(!pv({...cont,now:11}).okC,'continuation fails at 45%');

// Cases
eq(T.CASES.length,6,'6 cases');
ok(new Set(T.CASES.map(c=>c.id)).size===6,'case ids unique');
T.CASES.forEach(c=>{
  ['title','stem','ask','pit','cite'].forEach(k=>ok(c[k],c.id+' has '+k));
  ok(c.reason.length&&c.next.length&&c.data.length,c.id+' lists');
  const r=dx(c.dx);
  eq(r.res.map(x=>x.code),c.expect.codes,c.id+' diagnosis');
  eq(r.secondary,!!c.expect.secondary,c.id+' red flag');
  if(c.pv){
    const e=pv(c.pv);
    eq(e.okB,c.expect.btx,c.id+' Botox');eq(e.okC,c.expect.cgrp,c.id+' CGRP');eq(e.okT,c.expect.topi,c.id+' topiramate');
    eq(ahs(c.pv.mhd,c.pv.dis||0),c.expect.ahs,c.id+' AHS');
    if(c.expect.red!=null)eq(e.red,c.expect.red,c.id+' reduction');
  }
});
// Case 6 says 10 days passes and that entering current days fails the CM row.
const c6=T.CASES.find(c=>c.id==='c6');
ok(pv({...c6.pv,now:10,oncgrp:true}).okC,'case 6: 10 days passes');
ok(!pv({...c6.pv,mhd:12,now:10}).cmDx,'case 6: current days in the CM field fails');

// Quiz
eq(T.QUIZ.length,20,'20 questions');
eq(T.QUIZ.filter(q=>q.lv==='basic').length,10,'10 basic');
eq(T.QUIZ.filter(q=>q.lv==='adv').length,10,'10 advanced');
[0,1,2,3].forEach(a=>eq(T.QUIZ.filter(q=>q.a===a).length,5,'answer '+'ABCD'[a]+' count'));
T.QUIZ.forEach((q,i)=>{
  ok(q.o.length===4&&new Set(q.o).size===4,`Q${i+1} four distinct options`);
  ok(q.e&&q.s,`Q${i+1} explanation and source`);
  const k=q.check;if(!k)return;
  if(k.ahs)eq(ahs(...k.ahs),k.v,`Q${i+1} AHS`);
  if(k.pv){const e=pv(k.pv);if('okC' in k)eq(e.okC,k.okC,`Q${i+1} CGRP`);if('red' in k)eq(e.red,k.red,`Q${i+1} reduction`);}
});
// The correct option must not give itself away by being the single longest one.
const longest=T.QUIZ.filter(q=>q.o.every((x,j)=>j===q.a||x.length<q.o[q.a].length)).length;
ok(longest<=7,`correct option is the single longest in ${longest}/20`);
console.log('longest-option count',longest);

// Mind map
ok(T.MAP.left.length>=5&&T.MAP.right.length>=5,'map has both sides');
const tags=[...html.matchAll(/<b>([A-Z0-9]+)<\/b> /g)].map(m=>m[1]);
[...T.MAP.left,...T.MAP.right].forEach(([t,l])=>{ok(l.length>=2,'map branch '+t);l.forEach(([x,s])=>{ok(x&&s,'map leaf source '+x);ok(tags.includes(s),'map legend has '+s);});});

['cases','quiz','map'].forEach(t=>ok(html.includes(`id="tab-${t}"`)&&html.includes(`id="${t}"`),'pane '+t));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
