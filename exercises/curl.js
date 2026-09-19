// CURL V4 — Counter robusto basato sui dati reali del report V11.1.
// Obiettivo: contare la rep; tecnica e distanze restano SEPARATE dal counter.
// NON modificare index.html / core / loader.

const C = Object.freeze({
  EMA: .48,
  READY: 150, START: 138, TOP: 75, TOP_EXIT: 90,
  READY_FRAMES: 2, TOP_FRAMES: 2, RETURN_FRAMES: 2,
  MIN_REP_MS: 450, MAX_REP_MS: 8000,
  // Il report mostra confidence che scende temporaneamente al 27–29%:
  // non azzeriamo più una rep per un singolo calo di visibility.
  MIN_VIS: .15,
  LOST_GRACE_MS: 700
});

const IDX = {
  left:  { shoulder:11, elbow:13, wrist:15 },
  right: { shoulder:12, elbow:14, wrist:16 }
};

const fresh = () => ({
  phase:"GET_READY", reps:0, smooth:null,
  readyN:0, topN:0, returnN:0,
  start:0, lastGood:0, min:180, max:0
});
const A = { left:fresh(), right:fresh() };

function finite(x){ return Number.isFinite(x); }
function ang(a,b,c){
  if(!a||!b||!c) return null;
  const ux=a.x-b.x, uy=a.y-b.y, vx=c.x-b.x, vy=c.y-b.y;
  const d=Math.hypot(ux,uy)*Math.hypot(vx,vy);
  if(d<1e-8) return null;
  return Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/d)))*180/Math.PI;
}
function getPath(o,p){
  let v=o;
  for(const k of p.split(".")) v=v?.[k];
  return v;
}
function landmarks(frame){
  // Compatibilità con i nomi usati nelle varie revisioni del Core.
  for(const p of ["image","pose","poseLandmarks","landmarks","body.image","body.poseLandmarks"]){
    const v=getPath(frame,p);
    if(Array.isArray(v) && v.length>=17) return v;
  }
  return null;
}
function fallbackAngle(frame,side){
  const paths=[
    `angles2D.${side}Elbow`, `angles2D.${side}.elbow`,
    `imageAngles.${side}Elbow`, `angles.${side}Elbow`,
    `angles.${side}.elbow`, `jointAngles.${side}.elbow`,
    `elbowAngle.${side}`, `${side}ElbowAngle`
  ];
  for(const p of paths){
    const v=getPath(frame,p);
    if(finite(v)) return v;
  }
  return null;
}
function sample(frame,side){
  const lm=landmarks(frame), i=IDX[side];
  if(lm){
    const s=lm[i.shoulder], e=lm[i.elbow], w=lm[i.wrist];
    const a=ang(s,e,w);
    const vis=Math.min(s?.visibility??1,e?.visibility??1,w?.visibility??1);
    if(finite(a)) return {angle:a,vis};
  }
  const a=fallbackAngle(frame,side);
  return {angle:a,vis:finite(a)?1:0};
}
function resetMotion(st){
  st.phase="GET_READY"; st.smooth=null; st.readyN=st.topN=st.returnN=0;
  st.start=0; st.min=180; st.max=0;
}
function step(frame,side,now){
  const st=A[side], m=sample(frame,side);

  // Tracking assente davvero: concedi 700 ms prima di annullare.
  if(!finite(m.angle) || m.vis<C.MIN_VIS){
    if(st.lastGood && now-st.lastGood>C.LOST_GRACE_MS) resetMotion(st);
    return null;
  }
  st.lastGood=now;
  st.smooth = st.smooth===null ? m.angle : C.EMA*m.angle+(1-C.EMA)*st.smooth;
  const a=st.smooth;

  if(st.phase==="GET_READY"){
    st.readyN = a>=C.READY ? st.readyN+1 : 0;
    if(st.readyN>=C.READY_FRAMES) st.phase="READY";
    return null;
  }

  if(st.phase==="READY"){
    if(a<C.START){
      st.phase="UP"; st.start=now; st.min=a; st.max=a; st.topN=0;
    }
    return null;
  }

  st.min=Math.min(st.min,a); st.max=Math.max(st.max,a);
  if(now-st.start>C.MAX_REP_MS){ resetMotion(st); return null; }

  if(st.phase==="UP"){
    st.topN = a<=C.TOP ? st.topN+1 : 0;
    if(st.topN>=C.TOP_FRAMES) st.phase="TOP";
    return null;
  }

  if(st.phase==="TOP"){
    if(a>=C.TOP_EXIT){ st.phase="DOWN"; st.returnN=0; }
    return null;
  }

  if(st.phase==="DOWN"){
    st.returnN = a>=C.READY ? st.returnN+1 : 0;
    if(st.returnN>=C.RETURN_FRAMES){
      const duration=now-st.start;
      if(duration>=C.MIN_REP_MS && duration<=C.MAX_REP_MS){
        st.reps++;
        const ev={
          type:"rep", side, sideReps:st.reps,
          total:A.left.reps+A.right.reps,
          duration, minAngle:st.min, maxAngle:st.max
        };
        // Siamo già tornati distesi.
        st.phase="READY"; st.readyN=C.READY_FRAMES;
        st.topN=st.returnN=0; st.start=0; st.min=180; st.max=0;
        return ev;
      }
      resetMotion(st);
    }
  }
  return null;
}

const CurlExercise = {
  id:"curl", name:"Curl",
  reset(){ Object.assign(A.left,fresh()); Object.assign(A.right,fresh()); },
  analyze(frame){
    const now=performance.now();
    const le=step(frame,"left",now), re=step(frame,"right",now), ev=le||re;
    const l=sample(frame,"left"), r=sample(frame,"right");
    if(ev) window.dispatchEvent(new CustomEvent("exercise-rep",{
      detail:{exercise:"curl",...ev}
    }));
    return {
      phase:`SX ${A.left.phase} · DX ${A.right.phase}`,
      reps:A.left.reps+A.right.reps,
      leftReps:A.left.reps, rightReps:A.right.reps,
      leftAngle:A.left.smooth??l.angle, rightAngle:A.right.smooth??r.angle,
      event:ev
    };
  }
};

window.CurlExercise = CurlExercise;
