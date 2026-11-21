# Personal AI Brain

Cerebro visual inteligente, local y con memoria persistente, para macOS Apple Silicon.
Convierte tus documentos e imágenes en un grafo de conocimiento consultable en lenguaje natural,
con fuentes verificables y sin suscripciones.

- **Local por defecto**: la base de datos, los archivos originales y los embeddings viven en tu Mac.
- **Modelos en NVIDIA Build**: razonamiento, visión y embeddings vía API (el contenido procesado sale de tu equipo).
- **Cero coste obligatorio**: todo el software es gratuito y de código abierto.

### Fase JARVIS (voz, herramientas y móvil)

El proyecto evoluciona a un asistente personal: conversación por voz en español (whisper.cpp local +
voces de macOS), personalidad JARVIS, 15 herramientas con permisos y confirmación, creación real de
PowerPoint/Excel/Word/PDF, automatizaciones programadas, notificaciones y PWA para iPhone con acceso
autenticado. Guía completa: [`docs/JARVIS.md`](docs/JARVIS.md).

```bash
bash scripts/voice-e2e.sh "Jarvis, ¿qué sabes del Proyecto Aurora?"   # prueba de voz real
bash scripts/smoke-jarvis.sh                                          # voz, herramientas, permisos, auth
bash scripts/install-voices.sh                                        # Kokoro + voz JARVIS (Piper)
bash scripts/smoke.sh && bash scripts/smoke-jarvis.sh                 # verificación completa
```

---

## 1. Requisitos

| Elemento | Requisito |
| --- | --- |
| Equipo | Mac con Apple Silicon (probado en M4, 16 GB) |
| macOS | 13 o superior |
| Node.js | 22.5 o superior (probado con 26.x) |
| Cuenta | NVIDIA Build con acceso a los modelos indicados |
| RAM | 16 GB suficientes; el servidor usa ~200–400 MB en reposo |

No se instala Docker, PostgreSQL, Redis ni Neo4j. No se descargan modelos de 120B en local.

---

## 2. Instalación

```bash
cd ~/Jarvis
bash scripts/install.sh
```

El instalador:

1. Comprueba Node.js y la arquitectura.
2. Instala dependencias (`npm install`).
3. Compila la aplicación (`next build`).
4. Crea **Personal AI Brain.app** en `~/Applications` (arrástralo al Dock).

Después:

1. Abre la app desde `~/Applications` o el Launchpad.
2. Ve a **Configuración → Clave de NVIDIA** y pega tu clave `nvapi-…`.
   Se guarda en el **Llavero de macOS** (o en un archivo con permisos `0600` si el Llavero no está disponible).
3. Pulsa **Probar conexión real** para verificar los tres modelos.
4. Arrastra documentos en **Biblioteca**.

### Ejecución manual

```bash
npm run dev        # desarrollo, http://127.0.0.1:4317
npm run build && npm run start   # producción local
bash scripts/start.sh            # inicia si hace falta y abre el navegador
bash scripts/stop.sh             # detiene el servidor
```

---

## 3. Modelos verificados

Comprobados contra `GET /v1/models` y con llamadas reales el 19/11/2026:

| Rol | Modelo | Estado |
| --- | --- | --- |
| Principal | `nvidia/nemotron-3-ultra-550b-a55b` | Verificado (chat + JSON) |
| Visión | `nvidia/nemotron-3.5-super-vl-120b-a12b` | Verificado (imagen + texto) |
| Embeddings | `nvidia/nemotron-3.5-embed-8b` (4096 dim.) | Verificado |

**Sustitución documentada**: el identificador pedido `nvidia/nemotron-3-super-120b-a12b` **no existe**
en el catálogo de la cuenta. Se usa `nemotron-3-ultra-550b-a55b`, disponible y validado.
Puedes cambiar cualquier modelo desde **Configuración → Modelos** sin tocar código.

Notas técnicas:

- La API de NVIDIA no acepta `extra_body`; el parámetro correcto en el cuerpo JSON es
  `chat_template_kwargs: { enable_thinking: false }` (así lo envía el SDK de OpenAI en Python).
- Los modelos de razonamiento consumen tokens en `reasoning_content`. La app lo guarda y lo muestra
  opcionalmente en el chat.

---

## 4. Uso

### Dashboard
Estado general: documentos, nodos, relaciones, trabajos activos, RAM del servidor y actividad.

### Cerebro visual
Grafo interactivo (React Flow):

- Zoom, desplazamiento y arrastre de nodos.
- Filtros por tipo y búsqueda por nombre.
- Color por categoría y tamaño según grado de conexión.
- Panel lateral con descripción, documentos de origen, relaciones con evidencia y confianza.
- Confirmar o descartar relaciones pendientes.
- Crear relaciones manuales, fusionar duplicados y eliminar nodos (con confirmación).
- Exportar el grafo a JSON.

### Chat IA
Recuperación híbrida (FTS5 + embeddings) antes de responder. Cada respuesta cita `[1]`, `[2]`…
con enlace al documento y página. Si no hay evidencia suficiente, lo dice explícitamente.
Historial persistente por conversación y razonamiento visible opcional.

### Biblioteca
Subida por arrastre o selector. Soporta PDF, DOCX, XLSX, TXT, MD, CSV, JSON, HTML e imágenes
(PNG/JPG/WEBP/GIF). Deduplicación por SHA-256, estados de procesamiento, errores, reprocesado y
exclusión del procesamiento remoto por documento.

### Memoria
Lista de conceptos, relaciones pendientes de validación y recuerdos creados por el usuario.
Edición, eliminación y consolidación de duplicados.

### Conexiones
Carpetas locales con sincronización incremental por hash. Google Drive, Gmail, Calendar y Notion
aparecen como **no configurados** (requieren OAuth y no se han declarado terminados).

### Configuración
Clave de NVIDIA, modelos (incluido el modelo específico para voz), prueba real de conectividad,
privacidad (interruptor global de procesamiento remoto), rendimiento, voz, notificaciones, acceso
remoto con token, respaldos y restauración.

### JARVIS
Conversación por voz y texto con herramientas: crea presentaciones, hojas de cálculo, documentos,
PDF y diagramas; consulta tu memoria, busca archivos, lee la agenda y envía notificaciones.
Push-to-talk, manos libres con palabra de activación, interrupción y respuestas habladas.

### Conversación
Sesión de voz con una sola activación («Jarvis»), turnos continuos, interrupción hablando, cierre por
frase o inactividad y dos modos de reconocimiento (conversación rápida / dictado preciso). Detalle y
pruebas: [`docs/CONVERSACION.md`](docs/CONVERSACION.md).

### Memoria personal, salud y correo
Memorias diferenciadas (episódica, semántica, preferencias, procedimental, documental y salud) con
origen, confianza y cifrado para lo sensible. Módulo de salud con consentimiento explícito,
extracción de analíticas y comparación de tendencias. Módulo de correo con importación `.eml`,
clasificación, aprendizaje de estilo y borradores. Detalle: [`docs/MEMORIA.md`](docs/MEMORIA.md).

### Voces
Comparador de voces en **Voces**: Kokoro (español e inglés británico), **Magpie de NVIDIA**
(voz masculina española Diego, vía Riva gRPC) y la voz JARVIS de Piper (solo inglés), con muestras,
latencia, licencia y activación por idioma. STT: whisper.cpp local o Parakeet (NVIDIA) como opción. Investigación completa en
[`docs/VOCES.md`](docs/VOCES.md).

### Herramientas y Automatizaciones
Catálogo de acciones con permisos, riesgo y registro; archivos generados descargables. Motor de
tareas programadas creado en lenguaje natural, con próxima ejecución y notificación.

---

## 5. Arquitectura

```
Next.js 16 (App Router, React 19, Tailwind 4)
 ├─ UI en español (7 secciones) + React Flow
 ├─ API local en 127.0.0.1:4317 (route handlers)
 └─ Procesamiento en proceso (cola persistente en SQLite)

SQLite (node:sqlite, WAL, FTS5)
 ├─ documents / chunks / chunks_fts
 ├─ embeddings (Float32 BLOB, 4096 dim.)
 ├─ nodes / edges (procedencia, confianza, estado)
 ├─ conversations / messages
 └─ jobs / events / settings / connectors

NVIDIA Build
 ├─ nemotron-3-ultra-550b-a55b   (razonamiento, extracción, chat)
 ├─ nemotron-3.5-super-vl-120b   (visión)
 └─ nemotron-3.5-embed-8b        (embeddings)
```

Detalle completo en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

### Pipeline documental

1. Validación de tipo y tamaño (máx. 60 MB) y hash SHA-256.
2. Extracción: pdfjs-dist (texto + render de páginas escaneadas con `@napi-rs/canvas`),
   mammoth (DOCX), exceljs (XLSX), lectura directa (texto) y canvas (imágenes).
3. Visión: descripción objetiva de imágenes y páginas sin texto.
4. Fragmentación con solapamiento configurable (1400/200 por defecto).
5. Embeddings por lotes de 16.
6. Extracción de entidades/relaciones con JSON estricto y evidencia literal.
7. Consolidación de duplicados por nombre normalizado.
8. Actualización del grafo y de la memoria.

---

## 6. Privacidad y seguridad

- Servidor escuchando **solo en 127.0.0.1**.
- Clave fuera del código: Llavero de macOS, variable de entorno o archivo `0600`. Nunca en Git.
- Los errores se redactan (`nvapi-…` → `nvapi-••••••`).
- Validación de rutas contra *path traversal*; nombres saneados; límite de tamaño.
- Los documentos se tratan como **datos**, no instrucciones (defensa contra inyección de prompts).
- Toda acción destructiva (borrar nodo, documento, restaurar respaldo) exige confirmación explícita.
- Registro de operaciones en la tabla `events`.
- **Aviso**: el contenido enviado a NVIDIA Build se procesa fuera de tu Mac. Puedes desactivar
  el procesamiento remoto globalmente o excluir documentos concretos.

---

## 7. Respaldos

```bash
bash scripts/backup.sh
bash scripts/restore.sh ~/Library/Application\ Support/PersonalAIBrain/backups/<archivo>.tar.gz --confirmar
```

El respaldo usa `VACUUM INTO` para una instantánea consistente e incluye `manifest.json`.
La restauración crea antes un respaldo de seguridad y cierra/reabre la base de datos.

---

## 8. Pruebas

```bash
npm run typecheck
npm test                 # pruebas unitarias (node:test)
bash scripts/smoke.sh    # integración real contra el servidor en marcha
```

`scripts/smoke.sh` verifica: salud, subida de PDF/imagen, procesado, nodos y relaciones,
búsqueda con fuentes, respaldo y restauración.

Resultados de la última ejecución en este equipo: ver [`docs/PRUEBAS.md`](docs/PRUEBAS.md).

---

## 9. Limitaciones conocidas

Ver [`docs/LIMITACIONES.md`](docs/LIMITACIONES.md). Resumen:

- No hay OCR local: las páginas escaneadas se envían al modelo de visión (máx. 12 páginas por PDF).
- `.doc` (Word 97), `.xls` antiguos y vídeo no están soportados.
- Los conectores Google/Notion no están implementados (solo carpetas locales).
- La extracción depende de la calidad del modelo: puede crear conceptos redundantes; usa
  "Fusionar duplicados" y la validación de relaciones pendientes.
- El servidor se lanza con `npm run start`; no está firmado ni notarizado como app nativa.
- Sin autenticación multiusuario: es una aplicación personal en localhost.

---

## 10. Estructura del proyecto

```
src/app/            páginas y rutas API
src/components/     UI compartida
src/lib/            núcleo: db, nvidia, ingest, graph, rag, parsers, backup…
scripts/            instalación, arranque, respaldo, smoke test
tests/              pruebas unitarias
docs/               arquitectura, pruebas, limitaciones
```
