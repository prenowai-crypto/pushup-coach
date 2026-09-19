// CURL V5 — compatibile con il contratto REALE di Core V1.1/V1.2.
// Il Bridge passa UniversalBiomechanics.frame, NON UniversalBody.frame.
// Quindi il landmark 2D grezzo NON è disponibile qui.
// Per il counter usiamo gli angoli gomito già presenti in frame.angles.
// Tecnica/relazioni restano separate dal conteggio.

const CFG=Object.freeze({
  EMA:.48,
  READY:150,
  START:138,
  TOP:75,
  TOP_EXIT:90,
  READY_FRAMES:2,
  TOP_FRAMES:2,
  RETURN_FRAMES:2,
  MIN_REP_MS:450,
  MAX_REP_MS:8000
});

const fresh=()=>({
  phase:"GET_READY",reps:0,sm:null,
  readyN:0,topN:0,returnN:0,start:0,
  min:180,max:0
});
const arm={left:fresh(),right:fresh()};

function rawAngle(frame,side){
  const v=frame?.angles?.[side==="left"?"leftElbow":"rightElbow"];
  return Number.isFinite(v)?v:null;
}

function step(frame,side,now){
  const s=arm[side],raw=rawAngle(frame,side);
  if(!Number.isFinite(raw)) return null;

  s.sm=s.sm==null?raw:CFG.EMA*raw+(1-CFG.EMA)*s.sm;
  const a=s.sm;

  if(s.phase==="GET_READY"){
    s.readyN=a>=CFG.READY?s.readyN+1:0;
    if(s.readyN>=CFG.READY_FRAMES)s.phase="READY";
    return null;
  }

  if(s.phase==="READY"){
    if(a<CFG.START){
      s.phase="UP";s.start=now;s.min=a;s.max=a;s.topN=0;
    }
    return null;
  }

  s.min=Math.min(s.min,a);s.max=Math.max(s.max,a);
  if(now-s.start>CFG.MAX_REP_MS){
    s.phase="GET_READY";s.readyN=s.topN=s.returnN=0;s.start=0;
    return null;
  }

  if(s.phase==="UP"){
    s.topN=a<=CFG.TOP?s.topN+1:0;
    if(s.topN>=CFG.TOP_FRAMES)s.phase="TOP";
    return null;
  }

  if(s.phase==="TOP"){
    if(a>=CFG.TOP_EXIT){s.phase="DOWN";s.returnN=0}
    return null;
  }

  if(s.phase==="DOWN"){
    s.returnN=a>=CFG.READY?s.returnN+1:0;
    if(s.returnN>=CFG.RETURN_FRAMES){
      const duration=now-s.start;
      if(duration>=CFG.MIN_REP_MS&&duration<=CFG.MAX_REP_MS){
        s.reps++;
        const ev={type:"rep",side,sideReps:s.reps,total:arm.left.reps+arm.right.reps,
                  duration,minAngle:s.min,maxAngle:s.max};
        s.phase="READY";s.readyN=CFG.READY_FRAMES;s.topN=s.returnN=0;
        s.start=0;s.min=180;s.max=0;
        return ev;
      }
      s.phase="GET_READY";s.readyN=s.topN=s.returnN=0;s.start=0;
    }
  }
  return null;
}

const CurlExercise={
  id:"curl",
  name:"Curl",

  reset(){
    Object.assign(arm.left,fresh());
    Object.assign(arm.right,fresh());
  },

  analyze(frame){
    const now=performance.now();
    const le=step(frame,"left",now);
    const re=step(frame,"right",now);
    const ev=le||re;

    if(ev){
      window.dispatchEvent(new CustomEvent("exercise-rep",{
        detail:{exercise:"curl",...ev}
      }));
    }

    return {
      phase:`SX ${arm.left.phase} · DX ${arm.right.phase}`,
      reps:arm.left.reps+arm.right.reps,
      leftReps:arm.left.reps,
      rightReps:arm.right.reps,
      leftAngle:arm.left.sm??rawAngle(frame,"left"),
      rightAngle:arm.right.sm??rawAngle(frame,"right"),
      event:ev
    };
  }
};

window.CurlExercise=CurlExercise;
