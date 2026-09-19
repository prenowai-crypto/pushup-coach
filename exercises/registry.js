import { CURL_PROFILE, createCurlExercise } from "./curl.js";
import { SQUAT_PROFILE, createSquatExercise } from "./squat.js";
export const EXERCISE_DEFINITIONS=[
 {profile:CURL_PROFILE,create:createCurlExercise},
 {profile:SQUAT_PROFILE,create:createSquatExercise}
];
export function populateExerciseSelect(select){
 select.innerHTML="";
 for(const d of EXERCISE_DEFINITIONS){
  const o=document.createElement("option");o.value=d.profile.id;o.textContent=d.profile.name;select.appendChild(o);
 }
}
