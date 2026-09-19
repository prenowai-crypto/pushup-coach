export const SQUAT_PROFILE = {
  id:"squat",name:"Squat",family:"angle_cycle",engine:"squat",
  view:"side",metric:"GINOCCHIO",sideLabel:"GAMBA",trackers:["pose"],
  landmarks:["shoulder","hip","knee","ankle"],
  phases:["GET_READY","READY","DESCENT","BOTTOM","ASCENT"],
  thresholds:{stand:SQUAT.STAND,start:SQUAT.START,bottom:SQUAT.BOTTOM},
  validators:["real_hip_descent"],
  errors:["torso_instability"]
 };
export function createSquatExercise(api){
 const {CFG,ui,angle2D,ema,dist,ErrorCoach,trackingCoach,fb,debug,speakText}=api;
 let squatState="GET_READY",smoothKnee=null,standFrames=0,bottomFrames=0,repStart=0,startHipY=null,reps=0,lastRepMs=0;
 function chooseLeg(lm){
 const score=s=>[23+s,25+s,27+s,29+s].reduce((n,i)=>n+(lm[i]?.visibility||0),0);
 return score(0)>=score(1)?{name:"SINISTRA",hip:23,knee:25,ankle:27,heel:29,sh:11}:{name:"DESTRA",hip:24,knee:26,ankle:28,heel:30,sh:12}
}
function analyzeSquat(lm){
 const s=chooseLeg(lm),hip=lm[s.hip],knee=lm[s.knee],ankle=lm[s.ankle],sh=lm[s.sh];
 ui.side.textContent=s.name;
 if([sh,hip,knee,ankle].some(p=>(p.visibility||0)<SQUAT.VIS)){trackingCoach(true);fb("Per lo squat devo vedere spalla, fianco, ginocchio e caviglia. Inquadra il corpo intero di lato.","warn",false);return}
 trackingCoach(false);
 let kneeAng=angle2D(hip,knee,ankle);smKnee=ema(smKnee,kneeAng,SQUAT.EMA);kneeAng=smKnee;ui.elbow.textContent=Math.round(kneeAng)+"°";
 const vertical={x:hip.x,y:hip.y-1}; const torsoAngle=angle2D(vertical,hip,sh);
 ErrorCoach.update("squat-torso",state==="DESCENT"||state==="ASCENT"?torsoAngle>SQUAT.TORSO_WARN:false,"Mantieni il busto più stabile");
 if(state==="GET_READY"){
   if(kneeAng>SQUAT.STAND){standFrames++;if(standFrames>=SQUAT.STAND_FRAMES){squatReadyKneeY=knee.y;squatReadyHipY=hip.y;setState("READY");fb("Pronto. Scendi controllando il movimento.","good")}}
   else{standFrames=0;fb("Mettiti in piedi e distendi le gambe per iniziare.","warn")}
 }else if(state==="READY"){
   if(kneeAng<SQUAT.START){repStart=performance.now();bottomFrames=0;setState("DESCENT");fb("Scendi con controllo.","good")}
 }else if(state==="DESCENT"){
   if(torsoAngle>SQUAT.TORSO_WARN)fb("Mantieni il busto più stabile durante la discesa.","warn");
   else if(kneeAng>SQUAT.START+5){setState("READY");fb("Riparti dalla posizione eretta.","warn")}
   else fb("Continua a scendere.","good");
   const hipDrop=squatReadyHipY==null?0:hip.y-squatReadyHipY;
   if(kneeAng<SQUAT.BOTTOM && hipDrop>.035){bottomFrames++;if(bottomFrames>=SQUAT.BOTTOM_FRAMES){setState("BOTTOM");fb("Profondità raggiunta. Ora risali.","good")}}else bottomFrames=0;
   if(performance.now()-repStart>SQUAT.MAX_REP){setState("GET_READY");fb("Ripartiamo dalla posizione eretta.","warn")}
 }else if(state==="BOTTOM"){
   if(kneeAng>SQUAT.BOTTOM+12){setState("ASCENT");fb("Risali fino a distendere le gambe.","good")}
 }else if(state==="ASCENT"){
   if(kneeAng>SQUAT.STAND){standFrames++;if(standFrames>=SQUAT.STAND_FRAMES){const ms=performance.now()-repStart;if(ms>=SQUAT.MIN_REP&&ms<=SQUAT.MAX_REP){reps++; api.setTotalReps(reps);ui.reps.textContent=reps;ui.tempo.textContent=(ms/1000).toFixed(1)+"s";fb("Ripetizione "+reps+". Bene.","good",false);speakText(String(reps),{force:true,key:"rep-"+reps,cooldown:0,maxAge:5000})}setState("READY");standFrames=0}}
   else standFrames=0
 }
 debug(`exercise=squat state=${state} side=${s.name} knee=${kneeAng.toFixed(1)} torso=${torsoAngle.toFixed(1)}`)
}

 return {id:"squat",profile:SQUAT_PROFILE,analyze:analyzeSquat,
 reset(){squatState="GET_READY";smoothKnee=null;standFrames=0;bottomFrames=0;repStart=0;startHipY=null;reps=0;lastRepMs=0;},
 getState:()=>({state:squatState,reps,lastRepMs})};
}
