// Exercise Loader V1
// Questo è il solo file di catalogo da aggiornare quando aggiungiamo esercizi.
// index.html resta congelato.

const catalog = [
  { id:"curl", name:"Curl", module:"./exercises/curl.js", global:"CurlExercise" }
];

const select=document.getElementById("exercise");
const bridge=window.ExerciseBridge;

async function loadEntry(entry){
  await import(entry.module);
  const exercise=window[entry.global];
  if(!exercise) throw new Error(`${entry.global} non esportato da ${entry.module}`);
  return exercise;
}

const loaded=new Map();
for(const entry of catalog){
  try{
    const exercise=await loadEntry(entry);
    loaded.set(entry.id,exercise);
    const option=document.createElement("option");
    option.value=entry.id; option.textContent=entry.name.toUpperCase();
    select.appendChild(option);
  }catch(err){
    console.error("Errore caricamento esercizio",entry.id,err);
  }
}

if(loaded.size){
  select.disabled=false;
  // Curl viene selezionato automaticamente quando è l'unico esercizio disponibile.
  const first=[...loaded.keys()][0];
  select.value=first;
  bridge.register(loaded.get(first));
}

select.addEventListener("change",()=>{
  const exercise=loaded.get(select.value);
  if(exercise) bridge.register(exercise);
  else bridge.unregister();
});
