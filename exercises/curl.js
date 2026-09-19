// CURL COUNTER VALIDATION — porting della FSM monolitica stabile.
// SOLO conteggio. I validator tecnici (gomito→torso, mano→bacino, postura, ecc.)
// verranno aggiunti dopo, SENZA cambiare questa FSM.
//
// Richiede Core V1.2 + exercise-loader.js.
// Non modificare index.html.

const CFG = Object.freeze({
  VIS: 0.48,
  EMA: 0.48,
  EXTENDED: 150,
  START_CURL: 138,
  TOP: 62,
  TOP_EXIT: 77,
  READY_FRAMES: 3,
  TOP_FRAMES: 2,
  EXT_FRAMES: 2,
  MIN_REP_MS: 600,
  MAX_REP_MS: 7000,
  MAX_TRACK_GAP_MS: 350
});

const newArm = () => ({
  phase: "GET_READY",
  reps: 0,
  readyFrames: 0,
  topFrames: 0,
  extFrames: 0,
  startedAt: 0,
  smoothed: null,
  lastSeen: 0,
  minAngle: 180,
  maxAngle: 0,
  reason: ""
});

const arms = { left: newArm(), right: newArm() };

function finite(v){ return Number.isFinite(v); }

function pathValue(obj, path){
  let v=obj;
  for(const k of path.split(".")) v=v?.[k];
  return finite(v) ? v : null;
}

function first(obj, paths){
  for(const p of paths){
    const v=pathValue(obj,p);
    if(v!==null) return v;
  }
  return null;
}

// Il Core attuale può esporre l'angolo gomito con nomi leggermente diversi.
// Usiamo SOLO l'angolo del gomito come trigger della rep.
// Le relazioni corporee NON bloccano il counter.
function elbowAngle(frame, side){
  return first(frame,[
    `angles2D.${side}Elbow`,
    `angles2D.${side}.elbow`,
    `imageAngles.${side}Elbow`,
    `angles.${side}Elbow`,
    `angles.${side}.elbow`,
    `jointAngles.${side}.elbow`
  ]);
}

function armConfidence(frame, side){
  return first(frame,[
    `confidence.${side}Arm`,
    `confidence.arm.${side}`,
    `confidence.arms.${side}`
  ]);
}

function resetMotion(st, reason=""){
  st.phase="GET_READY";
  st.readyFrames=0;
  st.topFrames=0;
  st.extFrames=0;
  st.startedAt=0;
  st.smoothed=null;
  st.minAngle=180;
  st.maxAngle=0;
  st.reason=reason;
}

function updateArm(frame, side, now){
  const st=arms[side];
  const raw=elbowAngle(frame,side);
  const conf=armConfidence(frame,side);

  // Non completare mai una rep attraverso una perdita di tracking.
  if(!finite(raw) || (finite(conf) && conf<CFG.VIS)){
    resetMotion(st,"TRACKING");
    st.lastSeen=now;
    return null;
  }
  if(st.lastSeen && now-st.lastSeen>CFG.MAX_TRACK_GAP_MS){
    resetMotion(st,"GAP");
  }
  st.lastSeen=now;

  st.smoothed = st.smoothed===null
    ? raw
    : CFG.EMA*raw + (1-CFG.EMA)*st.smoothed;

  const a=st.smoothed;

  switch(st.phase){
    case "GET_READY":
      if(a>CFG.EXTENDED){
        st.readyFrames++;
        if(st.readyFrames>=CFG.READY_FRAMES){
          st.phase="READY";
          st.reason="";
        }
      }else{
        st.readyFrames=0;
      }
      break;

    case "READY":
      if(a<CFG.START_CURL){
        st.phase="CURL_UP";
        st.startedAt=now;
        st.minAngle=a;
        st.maxAngle=a;
        st.topFrames=0;
      }
      break;

    case "CURL_UP":
      st.minAngle=Math.min(st.minAngle,a);
      st.maxAngle=Math.max(st.maxAngle,a);

      if(now-st.startedAt>CFG.MAX_REP_MS){
        resetMotion(st,"TIMEOUT");
        break;
      }

      if(a<CFG.TOP){
        st.topFrames++;
        if(st.topFrames>=CFG.TOP_FRAMES){
          st.phase="TOP";
        }
      }else{
        st.topFrames=0;
      }
      break;

    case "TOP":
      st.minAngle=Math.min(st.minAngle,a);
      st.maxAngle=Math.max(st.maxAngle,a);
      if(a>CFG.TOP_EXIT){
        st.phase="LOWER";
        st.extFrames=0;
      }
      break;

    case "LOWER":
      st.minAngle=Math.min(st.minAngle,a);
      st.maxAngle=Math.max(st.maxAngle,a);

      if(now-st.startedAt>CFG.MAX_REP_MS){
        resetMotion(st,"TIMEOUT");
        break;
      }

      if(a>CFG.EXTENDED){
        st.extFrames++;
        if(st.extFrames>=CFG.EXT_FRAMES){
          const duration=now-st.startedAt;
          if(duration>=CFG.MIN_REP_MS && duration<=CFG.MAX_REP_MS){
            st.reps++;
            const event={
              type:"rep",
              side,
              sideReps:st.reps,
              total:arms.left.reps+arms.right.reps,
              duration,
              minAngle:st.minAngle,
              maxAngle:st.maxAngle
            };

            // Come nella FSM stabile: la posizione estesa è già READY
            // per la ripetizione successiva.
            st.phase="READY";
            st.readyFrames=CFG.READY_FRAMES;
            st.topFrames=0;
            st.extFrames=0;
            st.startedAt=0;
            st.minAngle=180;
            st.maxAngle=0;
            st.reason="";
            return event;
          }
          resetMotion(st,"DURATION");
        }
      }else{
        st.extFrames=0;
      }
      break;
  }
  return null;
}

const CurlExercise = {
  id:"curl",
  name:"Curl",

  reset(){
    Object.assign(arms.left,newArm());
    Object.assign(arms.right,newArm());
  },

  analyze(frame){
    const now=performance.now();
    const leftEvent=updateArm(frame,"left",now);
    const rightEvent=updateArm(frame,"right",now);
    const event=leftEvent||rightEvent;

    const result={
      phase:`SX ${arms.left.phase} · DX ${arms.right.phase}`,
      reps:arms.left.reps+arms.right.reps,
      leftReps:arms.left.reps,
      rightReps:arms.right.reps,
      leftAngle:arms.left.smoothed ?? elbowAngle(frame,"left"),
      rightAngle:arms.right.smoothed ?? elbowAngle(frame,"right"),
      leftReason:arms.left.reason,
      rightReason:arms.right.reason,
      event
    };

    if(event){
      window.dispatchEvent(new CustomEvent("exercise-rep",{
        detail:{exercise:"curl",...event}
      }));
    }

    return result;
  }
};

window.CurlExercise=CurlExercise;
