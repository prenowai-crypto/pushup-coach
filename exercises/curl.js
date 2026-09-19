// Curl V2 — counter multi-segnale, indipendente SX/DX.
// Core/index invariati. Obiettivo: conteggio robusto frontale / 3-4 / laterale.

const CFG=Object.freeze({
  minArmConfidence:.52, minTorsoConfidence:.45,
  readyAngle:142, startAngle:132, topAngle:92, deepTopAngle:78,
  readyHandHipMax:.78, topHandHipMin:.72,
  readyWristShoulderMin:.62, topWristShoulderMax:.62,
  readyFrames:4, topFrames:2, returnFrames:3,
  minRepMs:650, maxRepMs:7000, minRom:48,
  maxGapMs:420, maxAngleJump:42, smooth:.48
});

const fresh=()=>({phase:"WAIT_READY",ready:0,top:0,ret:0,reps:0,start:0,
 minA:180,maxA:0,lastRaw:null,lastTs:0,a:null,reason:""});
const S={left:fresh(),right:fresh()};

const finite=v=>Number.isFinite(v);
function val(o,...paths){
 for(const path of paths){let v=o;for(const k of path.split("."))v=v?.[k];if(finite(v))return v}
 return null;
}
function M(f,s){
 const cap=s[0].toUpperCase()+s.slice(1);
 return {
  a:val(f,`angles.${s}Elbow`),
  conf:val(f,`confidence.${s}Arm`,`confidence.arm.${s}`)??0,
  torso:val(f,"confidence.torso")??0,
  hh:val(f,`relations.${s}HandToHip`),
  ws:val(f,`relations.${s}WristToShoulder`),
  et:val(f,`relations.${s}ElbowToTorso`)
 };
}
function resetSide(st,why="",keepReps=true){
 const reps=st.reps; Object.assign(st,fresh()); if(keepReps)st.reps=reps; st.reason=why;
}
function readyPose(m,a){
 let votes=0,available=0;
 if(finite(a)){available++; if(a>=CFG.readyAngle)votes++}
 if(finite(m.hh)){available++; if(m.hh<=CFG.readyHandHipMax)votes++}
 if(finite(m.ws)){available++; if(m.ws>=CFG.readyWristShoulderMin)votes++}
 return available>=2 && votes>=2;
}
function topPose(m,a){
 let votes=0,available=0;
 if(finite(a)){available++; if(a<=CFG.topAngle)votes++}
 if(finite(m.hh)){available++; if(m.hh>=CFG.topHandHipMin)votes++}
 if(finite(m.ws)){available++; if(m.ws<=CFG.topWristShoulderMax)votes++}
 // Angolo molto chiuso è sufficiente anche in frontale.
 return (finite(a)&&a<=CFG.deepTopAngle) || (available>=2&&votes>=2);
}
function update(f,side,ts){
 const st=S[side],m=M(f,side);
 if(!finite(m.a)||m.conf<CFG.minArmConfidence||m.torso<CFG.minTorsoConfidence){
   resetSide(st,"TRACKING");return null;
 }
 if(st.lastTs && ts-st.lastTs>CFG.maxGapMs){resetSide(st,"GAP");st.lastRaw=m.a;st.lastTs=ts;return null}
 if(st.lastRaw!==null && Math.abs(m.a-st.lastRaw)>CFG.maxAngleJump){
   resetSide(st,"ANGLE_JUMP");st.lastRaw=m.a;st.lastTs=ts;return null;
 }
 st.lastRaw=m.a;st.lastTs=ts;
 st.a=st.a===null?m.a:(CFG.smooth*m.a+(1-CFG.smooth)*st.a);
 const a=st.a,ready=readyPose(m,a),top=topPose(m,a);

 if(st.phase==="WAIT_READY"){
   if(ready){if(++st.ready>=CFG.readyFrames){st.phase="READY";st.reason=""}}else st.ready=0;
   return null;
 }
 if(st.phase==="READY"){
   if(a<CFG.startAngle || (!ready && finite(m.hh)&&m.hh>CFG.readyHandHipMax)){
     st.phase="UP";st.start=ts;st.minA=a;st.maxA=a;st.top=0;
   }
   return null;
 }

 st.minA=Math.min(st.minA,a);st.maxA=Math.max(st.maxA,a);
 if(ts-st.start>CFG.maxRepMs){resetSide(st,"TIMEOUT");return null}

 if(st.phase==="UP"){
   if(top){if(++st.top>=CFG.topFrames)st.phase="TOP"}else st.top=0;
   if(ready && ts-st.start>300){resetSide(st,"NO_TOP")}
   return null;
 }
 if(st.phase==="TOP"){
   // discesa: basta uscire chiaramente dalla zona alta
   if(a>Math.max(CFG.topAngle+10,105) || (finite(m.hh)&&m.hh<CFG.topHandHipMin*.88)){
     st.phase="DOWN";st.ret=0;
   }
   return null;
 }
 if(st.phase==="DOWN"){
   if(ready){
     if(++st.ret>=CFG.returnFrames){
       const duration=ts-st.start,rom=st.maxA-st.minA;
       if(duration>=CFG.minRepMs&&duration<=CFG.maxRepMs&&rom>=CFG.minRom){
         st.reps++; const ev={type:"rep",side,total:S.left.reps+S.right.reps,
           sideReps:st.reps,duration,rom};
         resetSide(st,""); return ev;
       }
       resetSide(st,rom<CFG.minRom?"ROM":"DURATION");
     }
   } else st.ret=0;
 }
 return null;
}

const CurlExercise={
 id:"curl",name:"Curl",
 reset(){Object.assign(S.left,fresh());Object.assign(S.right,fresh())},
 analyze(frame){
   const ts=performance.now();
   const le=update(frame,"left",ts),re=update(frame,"right",ts),event=le||re;
   const lm=M(frame,"left"),rm=M(frame,"right");
   const result={
    phase:`SX ${S.left.phase} · DX ${S.right.phase}`,
    reps:S.left.reps+S.right.reps,leftReps:S.left.reps,rightReps:S.right.reps,
    leftAngle:S.left.a??lm.a,rightAngle:S.right.a??rm.a,
    leftReason:S.left.reason,rightReason:S.right.reason,event
   };
   if(event){
     window.dispatchEvent(new CustomEvent("exercise-rep",{detail:{exercise:"curl",...event}}));
   }
   return result;
 }
};
window.CurlExercise=CurlExercise;
