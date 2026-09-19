// CURL V3 — porting corretto del counter monolitico.
// Usa DIRETTAMENTE frame.image (landmark 2D MediaPipe), come il Curl stabile.
// Core/index/loader NON vanno modificati.
//
// MediaPipe Pose:
// SX shoulder/elbow/wrist = 11/13/15
// DX shoulder/elbow/wrist = 12/14/16

const CFG=Object.freeze({
  VIS:.48, EMA:.48,
  EXTENDED:150, START:138, TOP:62, TOP_EXIT:77,
  READY_FRAMES:3, TOP_FRAMES:2, EXT_FRAMES:2,
  MIN_REP_MS:600, MAX_REP_MS:7000,
  MAX_GAP_MS:350
});

const IDX={
  left:{shoulder:11,elbow:13,wrist:15},
  right:{shoulder:12,elbow:14,wrist:16}
};

const fresh=()=>({
  phase:"GET_READY", reps:0, ready:0, top:0, ext:0,
  start:0, smooth:null, lastTs:0, min:180, max:0, reason:""
});
const S={left:fresh(),right:fresh()};

function angle2D(a,b,c){
  if(!a||!b||!c)return null;
  const bax=a.x-b.x,bay=a.y-b.y,bcx=c.x-b.x,bcy=c.y-b.y;
  const den=Math.hypot(bax,bay)*Math.hypot(bcx,bcy);
  if(!(den>1e-8))return null;
  const cos=Math.max(-1,Math.min(1,(bax*bcx+bay*bcy)/den));
  return Math.acos(cos)*180/Math.PI;
}
function measure(frame,side){
  const lm=frame?.image, i=IDX[side];
  if(!lm||!i)return {angle:null,vis:0};
  const sh=lm[i.shoulder],el=lm[i.elbow],wr=lm[i.wrist];
  const vis=Math.min(sh?.visibility??0,el?.visibility??0,wr?.visibility??0);
  return {angle:angle2D(sh,el,wr),vis};
}
function abort(st,why){
  const reps=st.reps;
  Object.assign(st,fresh());
  st.reps=reps; st.reason=why;
}
function update(frame,side,now){
  const st=S[side],m=measure(frame,side);

  if(!Number.isFinite(m.angle)||m.vis<CFG.VIS){
    abort(st,"TRACKING"); st.lastTs=now; return null;
  }
  if(st.lastTs && now-st.lastTs>CFG.MAX_GAP_MS){
    abort(st,"GAP");
  }
  st.lastTs=now;
  st.smooth=st.smooth===null?m.angle:CFG.EMA*m.angle+(1-CFG.EMA)*st.smooth;
  const a=st.smooth;

  if(st.phase==="GET_READY"){
    if(a>CFG.EXTENDED){
      if(++st.ready>=CFG.READY_FRAMES){st.phase="READY";st.reason="";}
    } else st.ready=0;
    return null;
  }

  if(st.phase==="READY"){
    if(a<CFG.START){
      st.phase="CURL_UP";st.start=now;st.min=a;st.max=a;st.top=0;
    }
    return null;
  }

  st.min=Math.min(st.min,a);st.max=Math.max(st.max,a);
  if(now-st.start>CFG.MAX_REP_MS){abort(st,"TIMEOUT");return null;}

  if(st.phase==="CURL_UP"){
    if(a<CFG.TOP){
      if(++st.top>=CFG.TOP_FRAMES)st.phase="TOP";
    } else st.top=0;
    return null;
  }

  if(st.phase==="TOP"){
    if(a>CFG.TOP_EXIT){st.phase="LOWER";st.ext=0;}
    return null;
  }

  if(st.phase==="LOWER"){
    if(a>CFG.EXTENDED){
      if(++st.ext>=CFG.EXT_FRAMES){
        const duration=now-st.start;
        if(duration>=CFG.MIN_REP_MS&&duration<=CFG.MAX_REP_MS){
          st.reps++;
          const ev={type:"rep",side,sideReps:st.reps,
                    total:S.left.reps+S.right.reps,duration,
                    minAngle:st.min,maxAngle:st.max};
          // Il braccio è già esteso: pronto per la rep successiva.
          st.phase="READY";st.ready=CFG.READY_FRAMES;st.top=0;st.ext=0;
          st.start=0;st.min=180;st.max=0;st.reason="";
          return ev;
        }
        abort(st,"DURATION");
      }
    } else st.ext=0;
  }
  return null;
}

const CurlExercise={
  id:"curl",name:"Curl",
  reset(){Object.assign(S.left,fresh());Object.assign(S.right,fresh());},
  analyze(frame){
    const now=performance.now();
    const le=update(frame,"left",now),re=update(frame,"right",now);
    const ev=le||re;
    const ml=measure(frame,"left"),mr=measure(frame,"right");
    const result={
      phase:`SX ${S.left.phase} · DX ${S.right.phase}`,
      reps:S.left.reps+S.right.reps,
      leftReps:S.left.reps,rightReps:S.right.reps,
      leftAngle:S.left.smooth??ml.angle,rightAngle:S.right.smooth??mr.angle,
      leftReason:S.left.reason,rightReason:S.right.reason,event:ev
    };
    if(ev)window.dispatchEvent(new CustomEvent("exercise-rep",{
      detail:{exercise:"curl",...ev}
    }));
    return result;
  }
};

window.CurlExercise=CurlExercise;
