# Limitaciones y trabajo pendiente

Este documento es explícito para que no haya funcionalidades declaradas como terminadas sin serlo.

## Limitaciones funcionales

1. **OCR local ausente.** Las páginas escaneadas se envían al modelo de visión (máximo 12 páginas
   por PDF). Un PDF escaneado de 200 páginas solo interpretará las 12 primeras páginas sin texto.
   *Mejora posible*: OCR con Vision framework de macOS (gratuito, local) para evitar el envío remoto.

2. **Formatos no soportados.** `.doc` (Word 97-2003), `.xls` antiguos, `.pptx`, `.epub`, vídeo y
   audio. Se rechazan o se tratan como texto si no son binarios.

3. **Conectores en la nube no implementados.** Google Drive, Gmail, Google Calendar y Notion
   aparecen en la interfaz marcados como *no configurados*. No hay flujo OAuth. Solo funciona el
   conector de carpetas locales.

4. **Extracción dependiente del modelo.** Puede producir conceptos redundantes
   ("Fase 2" vs "Fase 2 del Proyecto Aurora") o asignar tipos discutibles. Se mitiga con
   `dedupeNodes()` y con la validación manual de relaciones pendientes, pero no es perfecto.

5. **Sin edición de fragmentos.** Se puede editar un nodo (nombre, tipo, descripción) y confirmar
   o descartar relaciones, pero no editar el texto de un fragmento ni su página.

6. **Sin búsqueda por similitud entre documentos** más allá del grafo: no hay vista de
   "documentos relacionados" explícita (se puede inferir por nodos compartidos).

7. **Una sola persona.** No hay usuarios, roles ni autenticación. El servidor escucha en
   `127.0.0.1` y asume un único usuario local.

8. **Chat sin streaming token a token.** La respuesta llega completa tras el razonamiento.
   La interfaz muestra un indicador de progreso. *Mejora posible*: SSE.

## Limitaciones técnicas

9. **Cola secuencial.** Se procesa un documento a la vez (la concurrencia configurable limita las
   llamadas a NVIDIA dentro de un documento). Es deliberado por RAM y cuotas; procesar 100 PDFs
   grandes lleva tiempo.

10. **Búsqueda vectorial en memoria.** Cada consulta recorre todos los embeddings (coseno en JS).
    Con decenas de miles de fragmentos empezará a notarse. *Mejora posible*: índice HNSW o
    `sqlite-vec`.

11. **Sin caché de respuestas del modelo.** Reprocesar un documento vuelve a consumir cuota.

12. **Coste cero condicionado.** El software es gratuito, pero NVIDIA Build aplica límites de uso.
    Si la cuenta agota cuota, aparecerá un error 429 controlado y la app seguirá funcionando en
    modo local (FTS5 sin extracción nueva).

13. **Dependencia de `@napi-rs/canvas`** para renderizar PDFs escaneados e imágenes. Si el binario
    precompilado no estuviera disponible para una arquitectura, el renderizado se omite con un aviso
    y el resto de la app sigue operativa.

14. **La app no está firmada ni notarizada.** Es un bundle `.app` con un script lanzador que arranca
    `next start` y abre el navegador. Gatekeeper podría pedir confirmación la primera vez.
    *Mejora posible*: empaquetar con Tauri (requiere toolchain Rust).

15. **Puerto fijo 4317.** Si está ocupado, el arranque falla. Se puede cambiar con `--port`.

## Seguridad: riesgos residuales

16. **Contenido remoto.** Todo documento procesado con IA (texto, imágenes) sale del equipo hacia
    NVIDIA. Está avisado en la interfaz y se puede desactivar globalmente o por documento, pero el
    usuario debe decidirlo conscientemente.

17. **Inyección de prompts.** Se instruye al modelo para tratar el contenido como datos y no como
    instrucciones; no es una garantía absoluta frente a documentos adversariales.

18. **Clave en el Llavero.** Se pasa a `security` por argumento al guardarla (visible un instante en
    la lista de procesos). Es el mecanismo estándar de macOS, pero no es perfecto.

19. **Sin cifrado en reposo** de la base de datos ni de los archivos (FileVault cubre el disco).

## Pendiente sugerido (orden de valor)

1. OCR local con Vision framework para PDFs escaneados.
2. Conector de Google Drive con OAuth de solo lectura.
3. Streaming del chat (SSE) y cancelación de respuestas.
4. Índice vectorial aproximado (`sqlite-vec`) para >50k fragmentos.
5. Empaquetado Tauri firmado.
6. Detección de contradicciones entre documentos.

---

# Ampliación JARVIS — limitaciones añadidas

20. **Latencia de conversación ≈ 4 s** en caliente (y hasta 20 s en frío). No es tiempo real; no se
    promete conversación simultánea. Se debe a la síntesis `say` (~1,5 s), la transcripción (~1 s) y
    el modelo remoto (~1 s).
21. **El modelo de voz es distinto del principal** (`nemotron-3.5-lightning-30b-a3b`) para responder
    antes. Su calidad es inferior a `nemotron-3-ultra`; se puede cambiar en Configuración.
22. **`say` no es tan natural como Kokoro/Qwen3-TTS.** Se eligió por latencia, cero descargas y
    estabilidad en M4/16 GB. Kokoro requeriría Python + modelos (~300 MB) y no mejora la latencia.
23. **whisper `small`** comete errores en nombres propios (“Yarvis”). La palabra de activación tolera
    hasta 2 ediciones, pero la transcripción puede fallar en nombres poco comunes. Se puede subir a
    `medium` descargando otro modelo.
24. **Permisos de macOS**: Calendario, Recordatorios y Notas usan AppleScript y requieren autorización
    de Automatización. Sin ella, las herramientas devuelven un error explicativo (no se ha aceptado
    el diálogo en esta sesión).
25. **Sin Canva.** No hay integración oficial verificada; no se declara conectada.
26. **Sin Web Push.** Las notificaciones al iPhone dependen de ntfy o Telegram (gratuitos) y de que
    el Mac esté encendido. No hay cola en la nube.
27. **Acceso remoto** depende de una red privada (Tailscale). El servidor no se expone a internet y
    no hay cuentas multiusuario: un único token compartido, rotable.
28. **Mermaid** se genera como fuente `.mmd`; no se renderiza a PNG/SVG dentro de la app (requiere
    Chromium headless y ~300 MB adicionales).
29. **Automatizaciones** solo corren con la app abierta y el Mac despierto; el planificador revisa
    cada 60 s, por lo que la precisión es de ±1 minuto.
30. **Herramientas de creación** generan contenido a partir de lo que pide el usuario o de la
    memoria; no validan cifras ni hechos. Los archivos son plantillas sobrias, no diseño avanzado.


---

# Voces — limitaciones

31. **La voz JARVIS de Piper es solo inglesa.** Su fonemizador está fijado a `en-gb-x-rp`; en español
    resulta ininteligible. Se ofrece únicamente para inglés.
32. **Kokoro no es una voz “JARVIS”.** Es una voz masculina británica/española natural y con licencia
    Apache-2.0, pero no imita al personaje. La imitación más cercana sigue siendo Piper en inglés.
33. **Coste de RAM del motor de voz**: ~620 MB mientras está cargado. Se libera a los 10 min de
    inactividad y al cerrar la app; la primera frase tras arrancar tarda ~2–4 s más.
34. **La primera reproducción tras abrir la app** puede tardar 2–4 s (carga del modelo). La pantalla de
    JARVIS lo precarga en segundo plano.
35. **El timbre de las voces de Kokoro** procede de voces donadas/derivadas; para uso comercial hay que
    revisar la procedencia de cada voz, aunque el modelo sea Apache-2.0.
36. **Voces personalizadas**: se aceptan modelos Piper ONNX; no hay interfaz para entrenar voces dentro
    de la app. VoiceStudio no está incluido.
