// CURL DIAGNOSTIC V1
// Scopo: NON calibrare il curl. Registrare esattamente cosa riceve il modulo
// e dove si blocca la FSM. Sostituisce temporaneamente exercises/curl.js.
// Non modificare index/core/loader.

const IDX={left:{s:11,e:13,w:15},right:{s:12,e:14,w:16}};
const CFG={EMA:.48,READY:150,START:138,TOP:62,TOP_EXIT:77,READY_N:3,TOP_N:2,RETURN_N:2,MIN_MS:600,MAX_MS:7000};
const mk=()=>({phase:"GET_READY",reps:0,sm:null,readyN:0,topN:0,returnN:0,start:0,lastRaw:null,lastVis:null});
const A={left:mk(),right:mk()};
const LOG=[], MAXLOG=1200;
let lastUi=0;

function get(o,p){let v=o;for(const k of p.split("."))v=v?.[k];return v}
function landmarks(frame){
  for(const p of ["image","pose","poseLandmarks","landmarks","body.image","body.poseLandmarks"]){
    const v=get(frame,p); if(Array.isArray(v)&&v.length>=17)return {v,path:p};
  }
  return {v:null,path:"NONE"};
}
function angle(a,b,c){
  if(!a||!b||!c)return null;
  const ux=a.x-b.x,uy=a.y-b.y,vx=c.x-b.x,vy=c.y-b.y,d=Math.hypot(ux,uy)*Math.hypot(vx,vy);
  if(!(d>1e-8))return null;
  return Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/d)))*180/Math.PI;
}
function sample(frame,side){
  const L=landmarks(frame),i=IDX[side];
  if(!L.v)return {raw:null,vis:null,path:L.path};
  const s=L.v[i.s],e=L.v[i.e],w=L.v[i.w];
  return {raw:angle(s,e,w),vis:Math.min(s?.visibility??1,e?.visibility??1,w?.visibility??1),path:L.path};
}
function push(side,kind,st,s,extra=""){
  LOG.push({t:performance.now(),side,kind,phase:st.phase,raw:s.raw,sm:st.sm,vis:s.vis,
            readyN:st.readyN,topN:st.topN,returnN:st.returnN,extra});
  if(LOG.length>MAXLOG)LOG.shift();
}
function transition(st,side,s,to,why){
  const from=st.phase; st.phase=to; push(side,"TRANSITION",st,s,`${from} → ${to}: ${why}`);
}
function step(frame,side,now){
  const st=A[side],s=sample(frame,side); st.lastRaw=s.raw;st.lastVis=s.vis;
  if(!Number.isFinite(s.raw)){push(side,"NO_ANGLE",st,s,`landmark path=${s.path}`);return null}
  st.sm=st.sm===null?s.raw:CFG.EMA*s.raw+(1-CFG.EMA)*st.sm;
  push(side,"FRAME",st,s,`landmark path=${s.path}`);

  if(st.phase==="GET_READY"){
    st.readyN=st.sm>CFG.READY?st.readyN+1:0;
    if(st.readyN>=CFG.READY_N)transition(st,side,s,"READY",`sm ${st.sm.toFixed(1)} > ${CFG.READY}`);
  } else if(st.phase==="READY"){
    if(st.sm<CFG.START){st.start=now;st.topN=0;transition(st,side,s,"UP",`sm ${st.sm.toFixed(1)} < ${CFG.START}`)}
  } else if(st.phase==="UP"){
    if(now-st.start>CFG.MAX_MS){transition(st,side,s,"GET_READY","TIMEOUT UP");st.readyN=0;return null}
    st.topN=st.sm<CFG.TOP?st.topN+1:0;
    if(st.topN>=CFG.TOP_N)transition(st,side,s,"TOP",`sm ${st.sm.toFixed(1)} < ${CFG.TOP}`);
  } else if(st.phase==="TOP"){
    if(st.sm>CFG.TOP_EXIT){st.returnN=0;transition(st,side,s,"DOWN",`sm ${st.sm.toFixed(1)} > ${CFG.TOP_EXIT}`)}
  } else if(st.phase==="DOWN"){
    if(now-st.start>CFG.MAX_MS){transition(st,side,s,"GET_READY","TIMEOUT DOWN");st.readyN=0;return null}
    st.returnN=st.sm>CFG.READY?st.returnN+1:0;
    if(st.returnN>=CFG.RETURN_N){
      const dur=now-st.start;
      if(dur>=CFG.MIN_MS&&dur<=CFG.MAX_MS){
        st.reps++; const ev={type:"rep",side,sideReps:st.reps,total:A.left.reps+A.right.reps,duration:dur};
        push(side,"REP",st,s,`REP ${st.reps}; ${Math.round(dur)} ms`);
        st.phase="READY";st.readyN=CFG.READY_N;st.returnN=st.topN=0;st.start=0; return ev;
      }
      transition(st,side,s,"GET_READY",`BAD_DURATION ${Math.round(dur)} ms`);st.readyN=0;
    }
  }
  return null;
}

function esc(x){return String(x??"—").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function ensurePanel(){
  let d=document.getElementById("curlDiagnostic");
  if(d)return d;
  d=document.createElement("div");d.id="curlDiagnostic";
  d.style.cssText="position:fixed;z-index:99999;right:10px;top:80px;width:min(560px,calc(100vw - 20px));max-height:70vh;overflow:auto;background:#10151b;color:#eef;padding:12px;border:1px solid #4b5563;border-radius:12px;font:12px/1.35 monospace;box-shadow:0 10px 35px #0008";
  d.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px"><b>CURL DIAGNOSTIC</b><button id="curlDiagClear">AZZERA LOG</button></div><div id="curlDiagBody"></div>`;
  document.body.appendChild(d);
  d.querySelector("#curlDiagClear").onclick=()=>{LOG.length=0;Object.assign(A.left,mk());Object.assign(A.right,mk());render(true)};
  return d;
}
function summary(side){
  const rows=LOG.filter(x=>x.side===side), nums=k=>rows.map(x=>x[k]).filter(Number.isFinite);
  const stat=k=>{const a=nums(k);return a.length?`${Math.min(...a).toFixed(1)}–${Math.max(...a).toFixed(1)}`:"—"};
  const trans=rows.filter(x=>x.kind==="TRANSITION"||x.kind==="REP").slice(-12);
  return {raw:stat("raw"),sm:stat("sm"),vis:stat("vis"),trans};
}
function render(force=false){
  const now=performance.now();if(!force&&now-lastUi<250)return;lastUi=now;
  const d=ensurePanel(),b=d.querySelector("#curlDiagBody"),L=summary("left"),R=summary("right");
  const one=(name,st,s)=>`<div style="margin-top:9px"><b>${name}</b> · FSM <b>${esc(st.phase)}</b> · reps ${st.reps}<br>
RAW ${esc(Number.isFinite(st.lastRaw)?st.lastRaw.toFixed(1):"—")}° · SM ${esc(Number.isFinite(st.sm)?st.sm.toFixed(1):"—")}° · VIS ${esc(Number.isFinite(st.lastVis)?(st.lastVis*100).toFixed(0)+"%":"—")}<br>
session RAW ${s.raw}° · SM ${s.sm}° · VIS ${s.vis}<br>
ready/top/return = ${st.readyN}/${st.topN}/${st.returnN}<br>
${s.trans.map(x=>`${(x.t/1000).toFixed(1)}s ${esc(x.kind)} ${esc(x.extra)}`).join("<br>")||"nessuna transizione"}</div>`;
  const lp=landmarks(window.__lastCurlFrame||{}).path;
  b.innerHTML=`<div>Landmark source ultimo frame: <b>${esc(lp)}</b></div>
  <div>Soglie DIAGNOSTICHE originali: ready>${CFG.READY}, start&lt;${CFG.START}, top&lt;${CFG.TOP}, ritorno>${CFG.READY}</div>
  ${one("SX",A.left,L)}<hr>${one("DX",A.right,R)}
  <hr><b>COSA FARE:</b> 3 curl SX + 3 DX. Poi fai uno screenshot di questo pannello. Non serve il Recap Body Debug.`;
}
window.getCurlDiagnostic=()=>LOG.slice();
window.downloadCurlDiagnostic=()=>{
  const blob=new Blob([JSON.stringify(LOG,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="curl-diagnostic.json";a.click();URL.revokeObjectURL(a.href);
};

const CurlExercise={
  id:"curl",name:"Curl",
  reset(){Object.assign(A.left,mk());Object.assign(A.right,mk());LOG.length=0;render(true)},
  analyze(frame){
    window.__lastCurlFrame=frame;
    const now=performance.now(),le=step(frame,"left",now),re=step(frame,"right",now),ev=le||re;
    if(ev)window.dispatchEvent(new CustomEvent("exercise-rep",{detail:{exercise:"curl",...ev}}));
    render();
    return {phase:`SX ${A.left.phase} · DX ${A.right.phase}`,reps:A.left.reps+A.right.reps,
      leftReps:A.left.reps,rightReps:A.right.reps,leftAngle:A.left.sm,rightAngle:A.right.sm,event:ev};
  }
};
window.CurlExercise=CurlExercise;
