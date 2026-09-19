// CURL V6 — port diretto del counter 2D della V11.1 monolitica.
// Core V1.3 passa esplicitamente frame.image: i landmark MediaPipe originali.
// Il counter usa SOLO l'angolo 2D spalla-gomito-polso.
// Relazioni biomeccaniche restano disponibili per il validator tecnico successivo.

const CFG={VIS:.48,EMA:.48,EXTENDED:150,START_CURL:138,TOP:62,TOP_FRAMES:2,EXT_FRAMES:2,MIN_REP:600,MAX_REP:7000};
// Validator tecnico separato: NON modifica la FSM o il conteggio.
const TECH={ABS_WARN:.80,DELTA_WARN:.23,VOICE_COOLDOWN:4500};
let lastTechniqueVoice=0;


function angle2D(a,b,c){
  const ab=Math.atan2(a.y-b.y,a.x-b.x),cb=Math.atan2(c.y-b.y,c.x-b.x);
  let d=Math.abs((ab-cb)*180/Math.PI);return d>180?360-d:d;
}
function ema(old,v,a){return old==null?v:old*a+v*(1-a)}
function newArm(name,sh,el,wr){return{name,sh,el,wr,state:"GET_READY",smooth:null,topFrames:0,extFrames:0,repStart:0,reps:0,lastRepMs:0,lastRaw:null,lastVis:0,invalidFrames:0,lastInvalidVoice:0,tech:{baseline:null,repBase:null,repMax:null,last:null}}}
let arms={left:newArm("SX",11,13,15),right:newArm("DX",12,14,16)};
function resetArms(){arms={left:newArm("SX",11,13,15),right:newArm("DX",12,14,16)}}

function analyzeArm(lm,a,elbowToTorso,shoulderAngle){
  if(!lm?.length)return {ok:false,reason:"NO IMAGE LANDMARKS",arm:a};
  const sh=lm[a.sh],el=lm[a.el],wr=lm[a.wr];
  const vis=Math.min(sh?.visibility??0,el?.visibility??0,wr?.visibility??0);
  a.lastVis=vis;
  if(!sh||!el||!wr)return {ok:false,reason:"LANDMARK MANCANTI",arm:a};
  if(vis<CFG.VIS)return {ok:false,reason:`VIS ${Math.round(vis*100)}%`,arm:a};

  const raw=angle2D(sh,el,wr);a.lastRaw=raw;a.smooth=ema(a.smooth,raw,CFG.EMA);
  const ang=a.smooth,now=performance.now();let repEvent=false;

  // EXERCISE VALIDATOR: angolo 3D gomito-spalla-anca.
  // Braccio lungo il fianco ≈ basso; braccio all'altezza spalla ≈ 90°.
  // Se resta >=65° per 4 frame, il movimento NON è un Curl valido e la FSM viene annullata.
  const invalidPosition=Number.isFinite(shoulderAngle)&&shoulderAngle>=65;
  a.invalidFrames=invalidPosition?a.invalidFrames+1:0;
  if(a.invalidFrames>=4){
    a.state="GET_READY";a.topFrames=0;a.extFrames=0;a.repStart=0;
    return {ok:true,arm:a,ang,raw,vis,repEvent:false,valid:false,shoulderAngle};
  }

  // Misura tecnica separata: NON partecipa mai al conteggio.
  // Baseline aggiornata solo quando il braccio è esteso/pronto.
  if(Number.isFinite(elbowToTorso) && (a.state==="GET_READY"||a.state==="READY") && ang>CFG.EXTENDED){
    a.tech.baseline=a.tech.baseline==null?elbowToTorso:(a.tech.baseline*.9+elbowToTorso*.1);
  }

  if(Number.isFinite(elbowToTorso) && ["CURL_UP","TOP","LOWER"].includes(a.state)){
    a.tech.repMax=a.tech.repMax==null?elbowToTorso:Math.max(a.tech.repMax,elbowToTorso);
  }

  if(a.state==="GET_READY"){
    if(ang>CFG.EXTENDED){if(++a.extFrames>=3){a.state="READY";a.extFrames=0}}else a.extFrames=0;
  }else if(a.state==="READY"){
    if(ang<CFG.START_CURL){
      a.repStart=now;a.topFrames=0;
      if(Number.isFinite(elbowToTorso)){
        a.tech.repBase=Number.isFinite(a.tech.baseline)?a.tech.baseline:elbowToTorso;
        a.tech.repMax=elbowToTorso;
      }else{a.tech.repBase=null;a.tech.repMax=null}
      a.state="CURL_UP"
    }
  }else if(a.state==="CURL_UP"){
    if(ang<CFG.TOP){if(++a.topFrames>=CFG.TOP_FRAMES){a.state="TOP";a.topFrames=0}}else a.topFrames=0;
    if(now-a.repStart>CFG.MAX_REP){a.state="GET_READY";a.repStart=0}
  }else if(a.state==="TOP"){
    if(ang>CFG.TOP+15)a.state="LOWER";
  }else if(a.state==="LOWER"){
    if(ang>CFG.EXTENDED){
      if(++a.extFrames>=CFG.EXT_FRAMES){
        const ms=now-a.repStart;
        if(ms>=CFG.MIN_REP&&ms<=CFG.MAX_REP){
          a.reps++;a.lastRepMs=ms;repEvent=true;
          if(Number.isFinite(a.tech.repBase)&&Number.isFinite(a.tech.repMax)){
            a.tech.last={base:a.tech.repBase,max:a.tech.repMax,delta:a.tech.repMax-a.tech.repBase};
          }else a.tech.last=null;
        }
        a.state="READY";a.extFrames=0;a.repStart=0;
      }
    }else a.extFrames=0;
  }
  return {ok:true,arm:a,ang,raw,vis,repEvent};
}

function validateTechnique(a){
  const t=a.tech.last;
  if(!t||![t.base,t.max,t.delta].every(Number.isFinite))return {status:"UNAVAILABLE",error:null};
  const absolute=t.base>=TECH.ABS_WARN||t.max>=TECH.ABS_WARN;
  const drift=t.delta>=TECH.DELTA_WARN;
  if(!(absolute||drift))return {status:"OK",error:null,base:t.base,max:t.max,delta:t.delta};
  return {status:"ERROR",error:"ELBOW_AWAY",base:t.base,max:t.max,delta:t.delta,reason:absolute?"DISTANCE":"DRIFT"};
}
function emitTechnique(side,v){
  if(v.status!=="ERROR")return;
  const now=Date.now(),speak=now-lastTechniqueVoice>=TECH.VOICE_COOLDOWN;
  window.dispatchEvent(new CustomEvent("exercise-technique",{detail:{
    exercise:"curl",side,error:v.error,
    message:`Tieni il gomito ${side==="SX"?"sinistro":"destro"} più vicino al fianco`,
    speak,metrics:{base:v.base,max:v.max,delta:v.delta,reason:v.reason}
  }}));
  if(speak)lastTechniqueVoice=now;
}

const CurlExercise={
  id:"curl",name:"Curl",
  reset(){resetArms()},
  analyze(frame){
    const lm=frame?.image,rel=frame?.relations||{},ang3=frame?.angles||{};
    const L=analyzeArm(lm,arms.left,rel.leftElbowToTorso,ang3.leftShoulder),
          R=analyzeArm(lm,arms.right,rel.rightElbowToTorso,ang3.rightShoulder);
    const total=arms.left.reps+arms.right.reps;

    // Posizione incompatibile col Curl: niente rep + correzione dedicata.
    for(const x of [L,R])if(x.valid===false){
      const now=Date.now();
      if(now-x.arm.lastInvalidVoice>=4500){
        x.arm.lastInvalidVoice=now;
        window.dispatchEvent(new CustomEvent("exercise-technique",{detail:{
          exercise:"curl",side:x.arm.name,error:"UPPER_ARM_TOO_HIGH",speak:true,
          message:`Abbassa il braccio ${x.arm.name==="SX"?"sinistro":"destro"}. Tieni il gomito vicino al fianco.`,
          metrics:{shoulderAngle:x.shoulderAngle}
        }}));
      }
    }
    for(const x of [L,R])if(x.repEvent){
      const validation=validateTechnique(x.arm);
      window.dispatchEvent(new CustomEvent("exercise-rep",{detail:{
        exercise:"curl",side:x.arm.name,total,sideReps:x.arm.reps,duration:x.arm.lastRepMs,
        technique:{elbowToTorso:x.arm.tech.last,validation}
      }}));
      emitTechnique(x.arm.name,validation);
    }
    const fmt=x=>x.ok?`${Math.round(x.ang)}°`:`${x.reason}`;
    return{
      phase:`SX ${arms.left.state.replace("_"," ")} · DX ${arms.right.state.replace("_"," ")}`,
      reps:total,leftReps:arms.left.reps,rightReps:arms.right.reps,
      leftAngle:L.ok?L.ang:null,rightAngle:R.ok?R.ang:null,
      debug:`CURL V6.3 GATE+VOICE | SX ${fmt(L)} raw=${Number.isFinite(arms.left.lastRaw)?Math.round(arms.left.lastRaw):"--"} vis=${Math.round(arms.left.lastVis*100)}% ${arms.left.state} rep=${arms.left.reps} | DX ${fmt(R)} raw=${Number.isFinite(arms.right.lastRaw)?Math.round(arms.right.lastRaw):"--"} vis=${Math.round(arms.right.lastVis*100)}% ${arms.right.state} rep=${arms.right.reps}`
    };
  }
};
window.CurlExercise=CurlExercise;
