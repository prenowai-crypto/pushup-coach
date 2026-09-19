// exercises/curl.js — CURL V1
// Primo esercizio collegato al Core V1. Nessuna dipendenza globale dall'index.
export const CURL_PROFILE = Object.freeze({
  id:"curl", name:"Bicep Curl · V1",
  thresholds:{
    ready:150, start:138, top:72,
    readyFrames:3, topFrames:2,
    minRepMs:550, maxRepMs:8000,
    minConfidence:.60
  }
});

export function createCurlExercise({onUpdate,onRep,onFeedback}={}){
  const T=CURL_PROFILE.thresholds;
  const arm=()=>({phase:"READY",smooth:null,readyFrames:0,topFrames:0,startAt:0,reps:0,lastRepMs:0});
  const S={left:arm(),right:arm()};
  const ema=(a,v,k=.48)=>a==null?v:a*k+v*(1-k);

  function step(side,frame){
    const s=S[side], key=side==="left"?"leftElbow":"rightElbow";
    const conf=side==="left"?frame?.confidence?.leftArm:frame?.confidence?.rightArm;
    const raw=frame?.angles?.[key];
    if(!Number.isFinite(raw)||!Number.isFinite(conf)||conf<T.minConfidence){
      s.readyFrames=0;s.topFrames=0;return;
    }
    const a=s.smooth=ema(s.smooth,raw);
    const now=frame.time||performance.now();

    if(s.phase==="READY"){
      if(a>=T.ready){ if(++s.readyFrames>=T.readyFrames)s.phase="ARMED"; }
      else s.readyFrames=0;
    } else if(s.phase==="ARMED"){
      if(a<T.start){s.phase="UP";s.startAt=now;s.topFrames=0;}
    } else if(s.phase==="UP"){
      if(a<=T.top){ if(++s.topFrames>=T.topFrames)s.phase="TOP"; }
      else s.topFrames=0;
    } else if(s.phase==="TOP"){
      if(a>T.top+10)s.phase="DOWN";
    } else if(s.phase==="DOWN"){
      if(a>=T.ready){
        const dt=now-s.startAt;
        if(dt>=T.minRepMs&&dt<=T.maxRepMs){
          s.reps++;s.lastRepMs=dt;
          onRep?.({side,reps:s.reps,total:S.left.reps+S.right.reps,durationMs:dt,angle:a});
        }
        s.phase="ARMED";s.readyFrames=T.readyFrames;s.topFrames=0;
      }
    }
  }

  function analyze(frame){
    if(!frame)return;
    step("left",frame); step("right",frame);
    const total=S.left.reps+S.right.reps;
    onUpdate?.({
      total,left:S.left.reps,right:S.right.reps,
      leftPhase:S.left.phase,rightPhase:S.right.phase,
      leftAngle:S.left.smooth,rightAngle:S.right.smooth,
      lastMs:Math.max(S.left.lastRepMs||0,S.right.lastRepMs||0)
    });
  }
  function reset(){S.left=arm();S.right=arm();onUpdate?.({total:0,left:0,right:0,leftPhase:"READY",rightPhase:"READY"});}
  return {id:CURL_PROFILE.id,profile:CURL_PROFILE,analyze,reset,getState:()=>structuredClone(S)};
}
