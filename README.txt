AI Gym Coach V6.3 — Piper self-hosted runtime

Questa build include nel repository gli asset ONNX Runtime:
  ort/ort-wasm-simd-threaded.mjs
  ort/ort-wasm-simd-threaded.wasm

Motivo:
la V6.2 dipendeva da cdnjs ONNX Runtime 1.18, che non pubblica il file .mjs
richiesto dal caricamento dinamico. V6.3 prova a configurare piper-tts-web
per usare ./ort/ prima dell'inferenza.

IMPORTANTE PER GITHUB PAGES:
carica l'intero contenuto dello ZIP, mantenendo la cartella ort/.
Non caricare soltanto index.html.

La voce resta it_IT-paola-medium e viene scaricata/cachata dal wrapper.
meSpeak resta fallback.
