# Arquitectura — Personal AI Brain

## 1. Visión general

Aplicación local monolítica con dos capas: interfaz Next.js (React 19 + Tailwind 4) y un
backend en el mismo proceso (route handlers de Next) que contiene todo el dominio: base de
datos, cola de trabajos, adaptadores de modelos, pipeline documental y RAG.

No hay servicios externos obligatorios. El único servicio de red es la API de NVIDIA Build,
y puede desactivarse por completo.

```
┌──────────────────────────────────────────────────────────────┐
│ Navegador (Safari/Chrome)  http://127.0.0.1:4317             │
│  Dashboard · Cerebro · Chat · Biblioteca · Memoria · …       │
└───────────────▲──────────────────────────────────────────────┘
                │ fetch JSON / multipart
┌───────────────┴──────────────────────────────────────────────┐
│ Next.js 16 (App Router)                                      │
│  route handlers → lib/*                                      │
│   ├─ documents.ts  (alta, hash, almacenamiento)              │
│   ├─ jobs.ts       (cola persistente, 1 trabajo a la vez)    │
│   ├─ ingest.ts     (pipeline)                                │
│   ├─ extract.ts    (LLM → JSON validado con zod)             │
│   ├─ embeddings.ts (FTS5 + coseno)                           │
│   ├─ graph.ts      (nodos/aristas, dedupe, fusión)           │
│   ├─ rag.ts        (recuperación + respuesta con citas)      │
│   └─ backup.ts     (VACUUM INTO + tar)                       │
└───────────────▲──────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│ SQLite (node:sqlite, WAL, FTS5)                              │
│  ~/Library/Application Support/PersonalAIBrain/brain.db      │
└──────────────────────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼──────────────────────────────────────────────┐
│ NVIDIA Build · integrate.api.nvidia.com/v1                   │
│  nemotron-3-ultra-550b-a55b · nemotron-3.5-super-vl-120b     │
│  nemotron-3.5-embed-8b                                       │
└──────────────────────────────────────────────────────────────┘
```

## 2. Decisiones de diseño

| Decisión | Motivo |
| --- | --- |
| `node:sqlite` en lugar de `better-sqlite3` | Cero compilación nativa, incluido en Node 22+, WAL y FTS5 disponibles. |
| Sin Docker/Postgres/Neo4j/Redis | Un solo proceso, <100 MB en reposo, instalación trivial. |
| Grafos en tablas relacionales | El grafo es pequeño (miles de nodos); SQLite sobra y evita otra base de datos. |
| Vectores como BLOB `Float32` en SQLite | 4096 dims × 4 B = 16 KB/fragmento; búsqueda por coseno en JS es suficiente para uso personal. |
| Embeddings en NVIDIA Build | Evita descargar modelos locales y mantiene la RAM libre; se puede sustituir por un modelo local editando el adaptador. |
| Cola persistente en SQLite, 1 trabajo concurrente | En 16 GB la concurrencia alta no aporta y complica el control de cuotas. |
| `.app` con script de arranque en lugar de Tauri | Tauri exige toolchain Rust y compilación larga; el lanzador cumple "abrir desde el Dock" sin privilegios. |
| Tokens de razonamiento desactivados en extracción | `enable_thinking: false` reduce coste y evita JSON truncado; el chat sí puede mostrarlos. |

## 3. Esquema de datos

```sql
documents(id, name, ext, mime, size, hash UNIQUE, stored_path, origin, status, error,
          pages, chars, added_at, processed_at, excluded_remote, meta)

chunks(id, doc_id → documents, idx, kind, page, content, created_at)
chunks_fts(content, chunk_id)            -- FTS5 unicode61 remove_diacritics

embeddings(chunk_id → chunks, model, dim, vector BLOB, created_at)

nodes(id, type, name, norm, description, status, confidence, origin, doc_ids JSON,
      created_at, updated_at, UNIQUE(type, norm))
edges(id, from_id → nodes, to_id → nodes, relation, evidence, confidence, origin,
      status, doc_id, chunk_id, created_at, UNIQUE(from_id,to_id,relation))

conversations(id, title, created_at, updated_at)
messages(id, conversation_id → conversations, role, content, reasoning, citations JSON, created_at)

jobs(id, doc_id, type, status, progress, step, attempts, error, created_at, updated_at)
events(id, level, kind, message, meta, created_at)
settings(key, value)
connectors(id, kind, name, config, status, last_sync, error, created_at)
```

### Modelo de confianza

- `origin`: `documento` (hecho del archivo), `ia` (extraído por el modelo), `usuario` (manual).
- `status` de nodo: `verificado`, `inferido`, `usuario`, `pendiente`.
- `status` de relación: `confirmada` (confianza ≥ 0.75 o validada) o `pendiente` (ambigua).
- `evidence`: cita literal que respalda la relación. Sin evidencia no se genera relación.

## 4. Pipeline de ingesta

1. **Alta** (`documents.ts`): extensión permitida, ≤60 MB, hash SHA-256, copia a
   `uploads/<uuid>/<nombre-saneado>`. Duplicado → se devuelve el documento existente.
2. **Parseo** (`parsers/index.ts`):
   - PDF: `pdfjs-dist` extrae texto por página. Páginas con <40 caracteres se renderizan con
     `@napi-rs/canvas` (máx. 12) y se envían a visión.
   - DOCX: `mammoth`. XLSX: `exceljs` (hojas → líneas `a | b | c`).
   - Imágenes: redimensionado a 1600 px y data URL.
3. **Visión** (`extract.describeImage`): descripción objetiva + transcripción de texto.
4. **Fragmentación**: por página si hay texto por página; tamaño 1400 y solapamiento 200
   configurables.
5. **Embeddings**: lotes de 16, guardados como BLOB.
6. **Extracción**: grupos de ≤6000 caracteres (máx. 8 por documento) → JSON con zod.
7. **Grafo**: nodo `documento`, aristas `menciona` (hecho) y relaciones con evidencia.
8. **Consolidación**: `pruneOrphans()` + `dedupeNodes()` (mismo nombre normalizado, distinto tipo).
9. **Estado**: `procesado`, avisos y errores guardados en `documents.error` y `meta`.

Todo el pipeline es idempotente: reprocesar borra fragmentos, embeddings y aristas del documento
y vuelve a construir.

## 5. Recuperación y respuesta (RAG)

1. Vector de la pregunta con `input_type: "query"`.
2. Búsqueda léxica FTS5 (bm25) y vectorial (coseno) en paralelo.
3. Fusión por *Reciprocal Rank Fusion* (peso 1.0 léxico, 1.2 vectorial).
4. Prompt con fragmentos numerados; instrucciones explícitas de citar solo números existentes,
   declarar falta de evidencia y tratar el contenido como datos.
5. Respuesta + lista de fuentes (`doc_id`, página, fragmento) persistida en `messages`.

Si no hay clave o falla la red, el chat devuelve un error legible y lo guarda en el historial.

## 6. Concurrencia y rendimiento

- Semáforo global para llamadas a NVIDIA (por defecto 2), configurable.
- Reintentos con backoff exponencial ante 429/5xx/timeout (3 intentos).
- Un documento a la vez en la cola; progreso granular por etapa.
- Cancelación cooperativa entre etapas y entre grupos de extracción.
- Sin caché de embeddings duplicados más allá del hash de documento; el coste es bajo.

## 7. Seguridad

- Escucha exclusiva en `127.0.0.1`.
- Claves: Llavero (`security`) → entorno → archivo `0600`. Redacción en errores y logs.
- `safeUploadPath()` valida que cualquier ruta resuelta permanezca dentro de `uploads/`.
- Nombres saneados (sin separadores, sin caracteres de control, sin `.` iniciales).
- Acciones destructivas con confirmación explícita en UI y `confirm: true` en la API de restauración.
- Restauración limitada a archivos dentro del directorio de respaldos.
- Registro de eventos (`events`) para auditoría local.
