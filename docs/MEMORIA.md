# Memoria personal, salud, correo y voz — fase 3

Fecha: 20/11/2026 · MacBook Air M4, 16 GB

---

## 1. Reinicio de memoria (ejecutado)

Inventario previo: 4 documentos, 4 fragmentos, 40 nodos, 60 relaciones, 4 conversaciones,
5 artefactos, 1 automatización y 22 ejecuciones de herramientas.

Antes de borrar se creó un **respaldo verificado**:

```
personal-ai-brain-2026-11-19T15-57-59-404Z.tar.gz (159.732 bytes)
Integridad SQLite: ok · 4 documentos en el respaldo
```

Se eliminó (todo recuperable desde el respaldo): documentos y sus archivos, fragmentos, embeddings,
nodos, relaciones, conversaciones, mensajes, artefactos, notas, automatizaciones, notificaciones,
ejecuciones y eventos. Se conservaron código, modelos, clave NVIDIA, token de acceso, configuración
de voz y permisos.

Procedimiento reproducible: `POST /api/admin/reset-memory {"confirmar": true}` (solo desde el Mac).

---

## 2. Memorias diferenciadas

| Tipo | Para qué | Ejemplo |
| --- | --- | --- |
| `episodica` | acontecimientos y conversaciones | “El 4 de noviembre revisó el informe con Laura” |
| `semantica` | hechos estables | “Trabaja en el Proyecto Aurora” |
| `preferencia` | estilos y gustos | “Prefiere respuestas breves y tutear” |
| `procedimental` | cómo quiere las tareas | “Los informes, en tres puntos” |
| `documental` | contenido indexado | fragmentos de la biblioteca |
| `salud` | datos médicos aislados | resultados de laboratorio |

Cada recuerdo guarda **origen, referencia, confianza, fecha y estado**. Las memorias sensibles se
guardan **cifradas con AES-256-GCM** (clave en el Llavero) y quedan fuera del índice de búsqueda.

Funciones disponibles:

- Aprender automáticamente de cada intercambio (`learnFromExchange`), solo si aporta algo duradero.
- Consolidar duplicados y olvidar memorias débiles sin uso (`POST /api/memory {"accion":"consolidar"}`).
- Preguntar **“¿Qué sabes de mí?”**, **“¿Por qué piensas eso?”** (`GET /api/memory/{id}`), corregir
  (`PATCH`) y olvidar (`DELETE`).
- Herramientas de voz: `buscar_recuerdos`, `recordar_hecho`, `olvidar_recuerdo` (esta última exige
  confirmación).

La respuesta del asistente incorpora las memorias relevantes y las preferencias en el prompt, sin
recitarlas literalmente.

---

## 3. Memoria de salud

- **Desactivada por defecto**. Se activa con consentimiento explícito en **Salud**.
- Cada informe exige una **casilla de autorización** que avisa de que el contenido se envía a NVIDIA.
- Extracción con Nemotron: fecha, laboratorio, analito, valor, unidad, rango y marca.
- Los valores se guardan estructurados; el JSON original se guarda **cifrado**.
- Comparación de tendencias con avisos si cambian las unidades o solo hay una medición.
- Eliminación verificable por informe (borra estudio y resultados).
- JARVIS no diagnostica ni modifica tratamientos; solo describe lo documentado.

Prueba real con tres análisis (marzo, junio, septiembre):

```
Colesterol total: 210 → 195 → 188 mg/dL (ref ≤ 200) · tendencia favorable
```

El asistente respondió usando la herramienta `consultar_salud`, no de memoria inventada.

---

## 4. Correo

- Importación de archivos `.eml` (recibidos o enviados) con `mailparser`.
- Clasificación automática: importante, personal, profesional, proyecto, solicitud, compromiso,
  promoción, spam, fraude, requiere respuesta, con confianza y resumen.
- **Aprendizaje de estilo** a partir de los enviados: tono, formalidad, saludo, despedida, longitud,
  estructura y vocabulario. Se guarda como preferencia y como memoria.
- **Borradores** con el estilo aprendido y el contexto real del hilo. Nunca se envían.
- Prueba real: 4 correos importados; el phishing se clasificó como **fraude**, la petición de Laura
  como **solicitud**. El borrador generado reprodujo el estilo (“Me viene bien…”, “Un saludo, Edu”).

Gmail directo **no está conectado**: requiere OAuth y autorización del usuario. La arquitectura
(`importEml`) permite enchufar el conector sin cambiar la clasificación ni el estilo.

---

## 5. Voz: Parakeet y Magpie (integrados)

Las claves facilitadas dan acceso a **Riva gRPC** (`grpc.nvcf.nvidia.com:443`), no a la API REST:
los endpoints `/v1/audio/*` devuelven 404 y los modelos no aparecen en `/v1/models`. Con el
`function-id` correcto y `nvidia-riva-client` sí funcionan:

| Modelo | function-id | Prueba real | Resultado |
| --- | --- | --- | --- |
| Parakeet multilingual ASR | `71203149-…` | audio de 5 s | “Hola Jarvis. Necesito que prepares un resumen de la agenda de **Ma Ana**…” (1,56 s) |
| Magpie TTS (Diego, es-US) | `877104f7-…` | 11,3 s de audio | síntesis en 1,8–2,3 s, transcripción posterior perfecta |

- **Parakeet**: añade puntuación y mayúsculas, pero confundió “mañana” en la muestra. Se ofrece como
  opción (`motor_stt=parakeet`) con **whisper.cpp como predeterminado** por precisión.
- **Magpie**: voz masculina española `Magpie-Multilingual.ES-US.Diego`, profunda y expresiva, con
  identidad consistente y 22 kHz. Disponible en **Voces** para escuchar y aprobar; no se activa sola.
- Las claves viven en el Llavero (`magpie-api-key`, `parakeet-api-key`), nunca en el repositorio.

### Latencia medida (en caliente)

| Etapa | Tiempo |
| --- | --- |
| Captura + fin de turno (VAD) | 1,1 s de silencio configurable |
| STT whisper local | 0,6 – 1,5 s |
| STT Parakeet (nube) | 1,5 – 1,8 s |
| Razonamiento (modelo de voz) | 0,7 – 2,1 s |
| TTS Kokoro | 0,9 – 1,7 s |
| TTS Magpie (11 s de audio) | 1,8 – 2,3 s |
| **Hasta el primer audio** | **3,3 – 6,1 s** |

No se alcanza el objetivo de 1–2 s por turno; se declara pendiente.

## 6. Seguridad

- Token de acceso para cualquier petición no local (proxy).
- Permisos por módulo: salud y correo desactivados por defecto.
- Cifrado AES-256-GCM para datos de salud y memorias sensibles.
- Registro de accesos a salud y correo en `events`.
- Separación datos/instrucciones en todos los prompts (correos, informes, documentos).
- Acciones destructivas con confirmación (`olvidar_recuerdo`, borrar informe, reiniciar memoria).

---

## 7. Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| Comprender instrucciones habladas en español | ✅ |
| Responder con voz natural aprobada | ⚠️ voz seleccionable; falta tu aprobación final |
| Conversación contextual | ✅ |
| Interrupciones | ✅ (detener + abortar petición) |
| Clasificar correos | ✅ |
| Identificar spam/fraude sin borrar | ✅ (solo etiqueta) |
| Relacionar personas, correos, proyectos y documentos | ⚠️ parcial: entidades y memorias; sin fusión automática correo-documento |
| Aprender estilo de correos enviados | ✅ |
| Crear borradores coherentes | ✅ |
| Aprender preferencias de presentaciones | ❌ pendiente |
| Procesar exámenes médicos | ✅ |
| Comparar resultados entre fechas | ✅ |
| Explicar origen de recuerdos | ✅ |
| Corregir y eliminar información | ✅ |
| Seguridad y permisos | ✅ |
| Parakeet / Magpie | ❌ no disponibles en la API (evidencia arriba) |
