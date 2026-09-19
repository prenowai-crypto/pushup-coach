// Curl V1 — modulo esterno per Core V1.1 ExerciseBridge
// Obiettivo: SOLO conteggio affidabile SX/DX. Nessuna correzione tecnica avanzata.

const CFG = Object.freeze({
  minConfidence: 0.60,
  readyAngle: 150,
  startAngle: 138,
  topAngle: 78,
  leaveTopAngle: 92,
  readyFrames: 5,
  topFrames: 3,
  returnFrames: 4,
  minRepMs: 800,
  maxRepMs: 8000,
  minROM: 65,
  maxGapMs: 280,
  maxAngleJump: 26
});

const sideState = () => ({
  phase:"WAIT_READY", ready:0, top:0, returned:0,
  startedAt:0, minAngle:180, maxAngle:0,
  lastAngle:null, lastTs:0, reps:0, reason:""
});
const S={left:sideState(),right:sideState()};

function num(v){ return Number.isFinite(v) ? v : null; }
function pick(obj,...paths){
  for(const p of paths){
    let v=obj;
    for(const k of p.split(".")) v=v?.[k];
    if(Number.isFinite(v)) return v;
  }
  return null;
}
function angle(frame,side){
  return pick(frame,
    `angles.${side}Elbow`,
    `angles.${side}.elbow`,
    `jointAngles.${side}.elbow`,
    `${side}.elbowAngle`
  );
}
function confidence(frame,side){
  return pick(frame,
    `confidence.arm.${side}`,
    `confidence.arms.${side}`,
    `confidence.${side}Arm`,
    `confidence.arm${side==="left"?"Left":"Right"}`
  ) ?? 1;
}
function abort(st,why){
  st.phase="WAIT_READY"; st.ready=st.top=st.returned=0;
  st.startedAt=0; st.minAngle=180; st.maxAngle=0; st.reason=why;
}
function update(frame,side,ts){
  const st=S[side], a=num(angle(frame,side)), c=confidence(frame,side);

  if(a===null || c<CFG.minConfidence){ abort(st,"TRACKING"); st.lastAngle=null; st.lastTs=ts; return null; }
  if(st.lastTs && ts-st.lastTs>CFG.maxGapMs){ abort(st,"GAP"); st.lastAngle=a; st.lastTs=ts; return null; }
  if(st.lastAngle!==null && Math.abs(a-st.lastAngle)>CFG.maxAngleJump){
    abort(st,"ANGLE_JUMP"); st.lastAngle=a; st.lastTs=ts; return null;
  }
  st.lastAngle=a; st.lastTs=ts;

  if(st.phase==="WAIT_READY"){
    if(a>=CFG.readyAngle){
      if(++st.ready>=CFG.readyFrames){ st.phase="READY"; st.reason=""; }
    } else st.ready=0;
    return null;
  }
  if(st.phase==="READY"){
    if(a<CFG.startAngle){
      st.phase="UP"; st.startedAt=ts; st.minAngle=a; st.maxAngle=a; st.top=0;
    }
    return null;
  }

  st.minAngle=Math.min(st.minAngle,a); st.maxAngle=Math.max(st.maxAngle,a);
  if(ts-st.startedAt>CFG.maxRepMs){ abort(st,"TIMEOUT"); return null; }

  if(st.phase==="UP"){
    if(a<=CFG.topAngle){
      if(++st.top>=CFG.topFrames){ st.phase="TOP"; }
    } else st.top=0;
    if(a>=CFG.readyAngle){ abort(st,"NO_TOP"); }
    return null;
  }
  if(st.phase==="TOP"){
    if(a>CFG.leaveTopAngle){ st.phase="DOWN"; st.returned=0; }
    return null;
  }
  if(st.phase==="DOWN"){
    if(a>=CFG.readyAngle){
      if(++st.returned>=CFG.returnFrames){
        const duration=ts-st.startedAt, rom=st.maxAngle-st.minAngle;
        if(duration>=CFG.minRepMs && duration<=CFG.maxRepMs && rom>=CFG.minROM){
          st.reps++;
          const ev={type:"rep",side,reps:st.reps,duration,rom};
          abort(st,""); return ev;
        }
        abort(st,rom<CFG.minROM?"ROM":"DURATION");
      }
    } else st.returned=0;
  }
  return null;
}

const CurlExercise={
  id:"curl",
  name:"Curl",
  reset(){ Object.assign(S.left,sideState()); Object.assign(S.right,sideState()); },
  analyze(frame){
    const ts=performance.now();
    const l=update(frame,"left",ts), r=update(frame,"right",ts);
    const event=l||r;
    const result={
      phase:`SX ${S.left.phase} · DX ${S.right.phase}`,
      reps:S.left.reps+S.right.reps,
      leftReps:S.left.reps,rightReps:S.right.reps,
      leftAngle:angle(frame,"left"),rightAngle:angle(frame,"right"),
      leftReason:S.left.reason,rightReason:S.right.reason,
      event
    };
    // Eventi generici opzionali: il Core può ascoltarli senza conoscere il Curl.
    if(event) window.dispatchEvent(new CustomEvent("exercise-rep",{detail:{exercise:"curl",...event,total:result.reps}}));
    return result;
  }
};

window.CurlExercise=CurlExercise;
