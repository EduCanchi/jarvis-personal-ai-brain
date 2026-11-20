# Informe de pruebas

Todas las cifras corresponden a ejecuciones reales en el equipo del usuario
(**MacBook Air M4, 16 GB, macOS 27.0.1, Node 26.13.0**) el **19/11/2026**.
No se presentan pruebas simuladas como reales: las llamadas a modelos fueron verificadas
contra `integrate.api.nvidia.com`.

## 1. Resumen

| Área | Resultado |
| --- | --- |
| Typecheck (`tsc --noEmit`) | ✅ 0 errores |
| Build de producción (`next build`) | ✅ compilado |
| Pruebas unitarias (`npm test`) | ✅ 10/10 |
| Integración real (`scripts/smoke.sh --restauracion`) | ✅ 17/17 |
| Modelos NVIDIA (catálogo + llamada real) | ✅ 3/3 |
| Persistencia tras reinicio | ✅ |
| Respaldo y restauración | ✅ |
| API key inválida | ✅ error controlado (401) |
| Cancelación de trabajo | ✅ |
| Carga representativa | ✅ 127 MB de pico de RAM |

## 2. Modelos verificados

Comprobación con `GET /v1/models` y llamada real mínima:

| Rol | Modelo | Catálogo | Llamada | Latencia |
| --- | --- | --- | --- | --- |
| Principal | `nvidia/nemotron-3-ultra-550b-a55b` | ✅ | ✅ "OK" | 1.988 ms |
| Visión | `nvidia/nemotron-3.5-super-vl-120b-a12b` | ✅ | ✅ "OK" | 451 ms |
| Embeddings | `nvidia/nemotron-3.5-embed-8b` | ✅ | ✅ 4096 dim. | 228 ms |

Hallazgo: `nvidia/nemotron-3-super-120b-a12b` **no existe** en el catálogo de la cuenta (33 modelos).
Sustituido por `nemotron-3-ultra-550b-a55b`. También se detectó que la API rechaza `extra_body`
(400 "Unsupported parameter(s)") y que el parámetro correcto es `chat_template_kwargs`.

## 3. Pruebas unitarias

```
✔ normalizeName elimina acentos, mayúsculas y puntuación
✔ normalizeName colapsa variantes que deben ser el mismo nodo
✔ canonicalType reconoce sinónimos y cae en concepto
✔ redact oculta claves nvapi y cabeceras Bearer
✔ sanitizeName bloquea path traversal y caracteres de control
✔ chunkText divide párrafos largos respetando el tamaño
✔ chunkText conserva párrafos cortos en un solo fragmento
✔ chunkText etiqueta la página cuando se indica
✔ chunkText devuelve vacío con texto vacío
✔ estimateTokens es proporcional a la longitud
```

## 4. Integración real (smoke test)

Ejecución con documentos generados en el momento (PDF de texto + PNG de diagrama):

```
[1] Salud y configuración        ✔ health · ✔ clave configurada
[2] Modelos                      ✔ ultra · ✔ visión · ✔ embeddings
[3] Documentos                   ✔ subida aceptada
[4] Procesamiento                ✔ estado procesado · ✔ fragmentos · ✔ relaciones
[5] Grafo                        ✔ nodos · ✔ aristas
[6] Chat                         ✔ respuesta · ✔ fuentes · ✔ menciona "Ana Torres"
[7] Persistencia                 ✔ conversación guardada
[8] Respaldo/restauración        ✔ respaldo creado · ✔ nodos intactos (50 → 50)
Resultado: 17 correctas, 0 fallidas
```

## 5. Escenario funcional completo (documentos reales de prueba)

Cuatro documentos incorporados por la interfaz/API:

- `acta-aurora.pdf` (PDF de texto)
- `notas-tecnicas.md` (Markdown con tabla)
- `proveedor-delta.md` (Markdown)
- `diagrama-aurora.png` (imagen con texto, analizada por el modelo de visión)

Resultado tras procesar:

| Métrica | Valor |
| --- | --- |
| Documentos | 4 procesados, 0 errores |
| Nodos | 42 |
| Relaciones | 80 (con evidencia y confianza) |
| Tipos | concepto 11 · documento 6 · organización 6 · proceso 6 · evento 4 · persona 4 · lugar 2 · tecnología 2 · proyecto 1 |
| Deduplicación | 29 nodos duplicados fusionados automáticamente en la primera pasada |

Ejemplo de relación generada y verificable:

```
Marta Ruiz --dirige--> Proyecto Aurora
  evidencia: "Marta Ruiz (directora del proyecto)"
  confianza: 0.95 · estado: confirmada · origen: ia · documento: acta-aurora.pdf
```

## 6. Chat con fuentes

Pregunta: *"¿Quién lidera el Proyecto Aurora y de qué presupuesto depende? Cita las fuentes."*

```
**Líder del proyecto:** Marta Ruiz (directora del Proyecto Aurora) [1][2][3].
**Presupuesto:** 120.000 euros, cuya disponibilidad depende de la aprobación del
comité financiero de Nebula Labs [2][3].
Fuentes: [1] notas-tecnicas.md · [2] acta-aurora.pdf p.1 · [3] diagrama-aurora.png
```

Pregunta sin evidencia: *"¿Cuánto cuesta la licencia de Windows 11 Pro?"*

```
No encuentro evidencia suficiente en tus documentos…
**Conocimiento general (no documentado):** …
```

Se cumple el requisito de no inventar y de distinguir lo documentado de lo general.

## 7. Rendimiento (presupuesto de 16 GB)

Carga: PDF de 15 páginas, 42.082 caracteres → 43 fragmentos, 43 embeddings.

| Métrica | Valor |
| --- | --- |
| Tiempo de procesamiento | 105 s (incluye 8 llamadas de extracción) |
| Pico de RSS del servidor | **127 MB** |
| RSS en reposo (producción) | 66 MB |
| Chat (8 fuentes, 2.898 tokens de contexto) | 14 s |
| Base de datos con 4 documentos | ~0,2 MB + archivos originales |

Conclusiones: el proceso nunca se acerca a los 16 GB; la concurrencia 2 y el procesamiento
secuencial de documentos son adecuados. El cuello de botella es la latencia de NVIDIA, no el equipo.

## 8. Robustez

| Prueba | Resultado |
| --- | --- |
| Reinicio del servidor | 4 documentos, 42 nodos, 80 relaciones y el historial se conservan |
| Clave inválida (`nvapi-AAAA…`) | Los 3 modelos devuelven "La clave de NVIDIA no es válida…" (401 controlado) |
| Clave con formato incorrecto | Rechazada en la validación (400) |
| Duplicado por hash | Devuelve el documento existente sin reprocesar |
| Cancelación de trabajo | Estado `cancelado`; documento marcado como cancelado |
| Respaldo | 138 KB con `brain.db`, `manifest.json` y `uploads/` |
| Restauración | Datos intactos; respaldo de seguridad previo creado automáticamente |
| Borrado de documento | Elimina fragmentos, embeddings, aristas y nodos huérfanos |
| Path traversal | `../../etc/passwd` → `passwd`; rutas fuera de `uploads/` rechazadas |

## 9. Interfaz

Renderizado verificado con Chromium headless sobre las 7 secciones:

| Página | Resultado |
| --- | --- |
| Dashboard | 200, métricas y actividad visibles |
| Cerebro visual | 200, 42 nodos de React Flow renderizados, sin errores de consola |
| Chat IA | 200 |
| Biblioteca | 200, documentos listados |
| Memoria | 200, nodos y relaciones |
| Conexiones | 200 |
| Configuración | 200, modelos y clave |

## 10. Qué NO se ha probado

- Conectores Google Drive / Gmail / Calendar / Notion (no implementados, requieren OAuth).
- Archivos de más de 60 MB (rechazados por diseño).
- PDFs escaneados de más de 12 páginas sin texto (solo se envían 12 a visión).
- Uso concurrente desde varios navegadores (aplicación personal).
- macOS 13/14 (probado en macOS 27).
- Cortes de red durante la extracción (hay reintentos, pero no se ha simulado un corte largo).

---

# Ampliación JARVIS — evidencias

Ejecutado el **19/11/2026** en el mismo equipo (MacBook Air M4, 16 GB, macOS 27.0.1, Node 26.13.0).

## A. Resumen

| Prueba | Resultado |
| --- | --- |
| Typecheck / build | ✅ 0 errores |
| Unitarias (17) | ✅ 17/17 |
| `scripts/smoke-jarvis.sh` | ✅ 17/17 |
| `scripts/voice-e2e.sh` (audio real generado) | ✅ transcripción exacta + respuesta + audio |
| Modelos de voz y herramientas | ✅ verificados con archivos reales |
| Acceso remoto con token | ✅ 401 sin token, 200 con token y cookie |
| Automatización programada | ✅ creada por lenguaje natural y ejecutada |

## B. Voz (mediciones en caliente)

| Etapa | Medición |
| --- | --- |
| STT whisper.cpp (audio 5 s, español) | 0,89 – 2,02 s (frío: 3,5 – 6,4 s) |
| Asistente modo voz (lightning 30B) | 0,71 – 1,33 s |
| TTS primera frase (`say` + AAC) | 1,34 – 1,93 s (cacheado: 0 s) |
| **Hasta el primer audio** | **3,98 s** (peor caso observado: 23 s en frío) |

Transcripción literal obtenida:
`"¿Yarvis, quién lidera el proyecto aurora y qué presupuesto tiene?"`
→ respuesta: “Marta Ruiz es la directora del proyecto Aurora. El presupuesto total es de 120.000 euros.”

RAM: `whisper-server` 739 MB cargado (se libera a los 10 min de inactividad), servidor 113 MB.

## C. Herramientas (archivos reales comprobados)

| Herramienta | Artefacto | Verificación |
| --- | --- | --- |
| `crear_presentacion` | `Mis vacaciones en la costa.pptx` (75 KB) | ZIP válido, 5 diapositivas, texto correcto |
| `crear_excel` | `gastos-marzo.xlsx` (6,7 KB) | `xl/workbook.xml` y cadenas correctas |
| `crear_word` | `carta.docx` (9,6 KB) | texto extraído del `document.xml` |
| `crear_pdf` | `informe.pdf` (1,6 KB) | `file`: PDF 1.3, 1 página |
| `crear_diagrama` | `flujo.mmd` | código Mermaid válido |
| `crear_recordatorio` | — | devuelve `requiere_confirmacion: true` sin ejecutar |
| `enviar_notificacion` | — | notificación local de macOS enviada (`status: enviada`) |

## D. Automatización

Petición: “Todos los lunes a las 9 prepárame un resumen de lo que sé sobre el Proyecto Aurora”.
Resultado: `{"tipo":"semanal","dia":1,"hora":"09:00"}`, próxima ejecución calculada, ejecución
manual en 7,7 s con notificación real enviada.

## E. Acceso remoto

| Petición | Resultado |
| --- | --- |
| `Host: mac.tailnet.ts.net` + `/api/health` | 401 `requiere_auth` |
| Página `/asistente` remota | 307 → `/login?next=/asistente` |
| Login con token | cookie `paib_session` httpOnly |
| Petición con cookie o `x-paib-token` | 200 |
| `POST /api/shortcuts/run` con token | texto plano de respuesta |

## F. Interfaz

Renderizado con Chromium headless: `/asistente`, `/herramientas`, `/automatizaciones`,
`/configuracion` y `/login` devuelven 200 y muestran sus datos (herramientas, artefactos,
automatización creada, token, etc.). Sin errores de consola de la aplicación.

## G. No verificado en dispositivo real

- Micrófono y altavoces del Mac con la interfaz (sí la ruta completa con audio generado).
- Permisos de Automatización de macOS (Calendario/Recordatorios/Notas): scripts listos, sin aceptar.
- iPhone físico, notificaciones ntfy/Telegram (requieren credenciales del usuario).
- Canva: no implementado.


---

# Voces — evidencias de la investigación

## H. Prueba de inteligibilidad (voz → whisper → texto)

| Voz | Texto original | Transcripción | Veredicto |
| --- | --- | --- | --- |
| Kokoro `em_alex` (es) | “Buenas noches. Todos los sistemas están operativos…” | idéntica | ✅ |
| Kokoro `bm_george` (en-GB) | “Good evening. All systems are operational…” | idéntica | ✅ |
| Piper `jarvis-high` (en-GB) | “Good evening. All systems are operational…” | “Both systems…” | ✅ (1 palabra) |
| Piper `jarvis-high` en español | “Buenas noches. Todos los sistemas están operativos…” | “UNAS Notches… preparados en 4” | ❌ |

## I. Latencia y memoria

| Motor | Frase corta (caliente) | RAM cargado | Modelo |
| --- | --- | --- | --- |
| Kokoro | 0,9 – 1,7 s | ~620 MB | 310 MB |
| Piper JARVIS | 1,5 – 1,7 s | ~540 MB | 109 MB |
| macOS `say` | 1,3 – 1,9 s | < 100 MB | sistema |

Cadena completa medida con `scripts/voice-e2e.sh`: STT 0,78 s · asistente 2,1 s · TTS 0,26 s
(cacheado) → **3,3 s hasta el primer audio**.

## J. Incidencias corregidas durante la integración

- `HTTPServer.server_bind()` de Python resolvía el nombre inverso de 127.0.0.1 y bloqueaba el
  arranque **35 s** en macOS. Se sustituyó por un bind directo: arranque en **0,25 s**.
- Kokoro rechazaba `lang="en"`; se mapea a `en-gb`.
- Al cambiar de motor se descarga el anterior para no sumar 1,2 GB de RAM.
