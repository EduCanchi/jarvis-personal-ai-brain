# JARVIS — guía de la ampliación

Esta fase convierte el *Personal AI Brain* en un asistente personal con voz, herramientas,
automatizaciones y acceso desde el iPhone, **sin sustituir** nada de lo anterior: el cerebro
visual, la memoria, la biblioteca y el chat con fuentes siguen funcionando sobre la misma base
de datos.

---

## 1. Qué hay nuevo

| Área | Implementado | Verificado en este Mac |
| --- | --- | --- |
| Voz → texto | whisper.cpp (`whisper-server`, modelo `ggml-small`, español) | ✅ audio real transcrito |
| Texto → voz | Voces nativas de macOS (`say` + AAC), seleccionables | ✅ audio generado y reproducido |
| Conversación | Push-to-talk, VAD, manos libres, palabra de activación, interrupción | ✅ lógica y endpoints; micrófono real pendiente de permiso del usuario |
| Personalidad | JARVIS en español, breve, honesto, sin afirmar acciones no ejecutadas | ✅ |
| Herramientas | 14 herramientas con permisos, riesgo, confirmación y registro | ✅ |
| Documentos | PPTX, XLSX, DOCX, PDF, Mermaid | ✅ archivos válidos abiertos y comprobados |
| Apple | Calendario, Recordatorios, Notas, notificaciones | ⚠️ implementado; requiere permiso de Automatización del usuario |
| Automatizaciones | Motor programado + creación por lenguaje natural | ✅ creada y ejecutada |
| Notificaciones | macOS local, ntfy (iPhone), Telegram | ✅ local; ntfy/Telegram requieren credenciales |
| iPhone | PWA, diseño móvil, token de acceso, atajo de Apple | ✅ PWA y auth probados por HTTP; ⚠️ falta probar en dispositivo |
| Canva | — | ❌ **no conectado** |

---

## 2. Voz

### Cómo se usa

1. Abre **JARVIS** en la barra lateral.
2. Pulsa el orbe del micrófono y habla. Al detectar ~1,1 s de silencio, envía la frase.
3. JARVIS responde por texto y, si *Responder en voz* está activo, también hablado.
4. Pulsa el orbe mientras habla para **interrumpir**.
5. Activa **Manos libres** para conversación continua: cada intervención debe contener la palabra
   de activación (por defecto “Jarvis”; se toleran errores de transcripción como “Yarvis”).

### Cómo está hecho

- **STT**: `whisper-server` (brew `whisper-cpp`), modelo `ggml-small` en
  `~/Library/Application Support/PersonalAIBrain/models/ggml-small.bin`.
  Se arranca al primer uso, se reutiliza entre peticiones y **se apaga tras 10 minutos sin uso**
  para liberar ~740 MB de RAM.
- **TTS**: `/usr/bin/say` con voces `es_ES`/`es_MX` (Mónica, Paulina…), convertido a AAC con
  `afconvert` y cacheado por hash de texto+voz+velocidad. Se sintetiza **por frases** para que el
  primer audio llegue antes.
- **Anti-eco**: mientras se reproduce audio no se graba; en manos libres se reanuda 500 ms después.
- **Permisos**: el navegador pide micrófono la primera vez. Si se deniega, la app explica cómo
  activarlo en Ajustes del Sistema.

### Latencia medida (M4, 16 GB, en caliente)

| Etapa | Tiempo |
| --- | --- |
| Transcripción (audio de 5 s) | **0,9 – 2,0 s** |
| Respuesta del asistente (modelo de voz) | **0,7 – 1,3 s** |
| Primera frase sintetizada | **1,3 – 1,9 s** |
| **Hasta el primer audio** | **≈ 4,0 s** |

En frío (primer uso tras arrancar, o ráfaga de peticiones) puede llegar a 15–20 s.
**No es una conversación en tiempo real**: es una conversación por turnos con ~4 s de latencia.
Para el modelo de voz se usa `nvidia/nemotron-3.5-lightning-30b-a3b`; el chat escrito sigue con
`nemotron-3-ultra-550b-a55b`. Ambos se pueden cambiar en Configuración.

---

## 3. Herramientas

Registro en `src/lib/tools/`. Cada herramienta declara nombre, descripción, parámetros, permisos,
riesgo, si requiere confirmación, estado y ejecución registrada en `tool_runs`.

| Herramienta | Riesgo | Confirmación |
| --- | --- | --- |
| `crear_presentacion` (PptxGenJS) | bajo | no |
| `crear_excel` (ExcelJS) | bajo | no |
| `crear_word` (docx) | bajo | no |
| `crear_pdf` (PDFKit) | bajo | no |
| `crear_diagrama` (Mermaid `.mmd`) | bajo | no |
| `buscar_conocimiento` (RAG) | bajo | no |
| `guardar_nota` / `buscar_notas` | bajo | no |
| `buscar_archivos` (Spotlight) | medio | no |
| `estado_sistema` | bajo | no |
| `enviar_notificacion` | bajo | no |
| `consultar_agenda` (Calendar) | medio | no |
| `crear_recordatorio` (Reminders) | medio | **sí** |
| `crear_evento` (Calendar) | medio | **sí** |
| `crear_nota_apple` (Notas) | medio | **sí** |

Flujo: Nemotron propone una herramienta en JSON → el servidor valida que exista → ejecuta →
devuelve el resultado real → el modelo redacta la respuesta. Si el modelo afirma haber hecho algo
sin ejecutar ninguna herramienta, la respuesta añade una nota de transparencia.

Los archivos generados se guardan en `~/Library/Application Support/PersonalAIBrain/artifacts`
y se descargan desde **Herramientas** o desde el enlace de la respuesta.

---

## 4. Automatizaciones

- Se crean en **Automatizaciones** con lenguaje natural: “cada mañana a las 8 resúmeme la agenda”.
- Programaciones: cada N minutos, diaria a HH:MM, semanal (día + hora).
- El planificador corre dentro del servidor y revisa cada minuto; cada automatización muestra
  frecuencia, próxima ejecución, última ejecución y resultado.
- Al terminar notifica por el canal configurado (salvo que el propio asistente ya haya notificado).
- Se pueden desactivar o borrar en cualquier momento.

---

## 5. iPhone

### Opción recomendada: Tailscale + PWA

1. Instala **Tailscale** en el Mac y en el iPhone con la misma cuenta (gratis para uso personal).
2. En el Mac, la app ya escucha en `127.0.0.1:4317`; expón solo ese puerto a la tailnet:
   ```bash
   tailscale serve --bg 4317
   ```
   (También vale `tailscale ip -4` y abrir `http://100.x.y.z:4317` dentro de la tailnet.)
3. En **Configuración → Acceso remoto**, pulsa *Mostrar token* y copia el valor.
4. En Safari del iPhone abre la URL de la tailnet, introduce el token y entra.
5. Comparte → **Añadir a pantalla de inicio**. La PWA abre en `/asistente` y usa el diseño móvil.

**Nunca** abras el puerto a internet ni uses un túnel público sin autenticación. Cualquier petición
que no venga de `localhost` exige el token (cookie o cabecera `x-paib-token`).

### Atajos de Apple / Siri

El endpoint `POST /api/shortcuts/run` devuelve texto plano:

```bash
curl -X POST http://<mac>:4317/api/shortcuts/run \
  -H "x-paib-token: <token>" -H "Content-Type: application/json" \
  -d '{"instruccion":"¿qué tengo mañana?"}'
```

En Atajos: acción *Obtener contenido de URL* (método POST, cabecera `x-paib-token`, cuerpo JSON) →
*Mostrar resultado* o *Hablar texto*. Se puede invocar desde Siri con “Oye Siri, preguntar a JARVIS”.

### Notificaciones en el iPhone

- **ntfy** (gratis, sin cuenta): instala la app ntfy, suscríbete a un tema secreto
  (p. ej. `jarvis-ana-8f3a91`) y pon ese tema en Configuración → Notificaciones.
- **Telegram**: crea un bot con @BotFather, obtén el `chat_id` y configura token + chat.
- **Web Push**: no implementado; requiere VAPID y un servicio push al que el Mac debería conectarse
  de forma permanente. Se documenta como pendiente.

### Si el Mac está apagado o suspendido

El servidor no responde. El iPhone mostrará un error de red; no hay cola en la nube. Los avisos
programados solo se ejecutan con el Mac encendido (puedes impedir la suspensión con
`caffeinate -s` o Ajustes → Batería → “Evitar que el Mac se duerma automáticamente”).

---

## 6. Seguridad

- Escucha solo en `127.0.0.1`; para el móvil, red privada (Tailscale).
- Token de acceso remoto de 32 caracteres en
  `~/Library/Application Support/PersonalAIBrain/access-token.txt` (0600), rotable.
- Clave NVIDIA en el Llavero; nunca en el repositorio ni en logs.
- Herramientas sensibles piden confirmación explícita; las destructivas no existen.
- Los documentos y fragmentos se tratan como datos, no como instrucciones.
- Registro de ejecuciones (`tool_runs`), notificaciones y eventos.
- Permisos de macOS: Calendario, Recordatorios y Notas requieren autorización de Automatización
  (Ajustes del Sistema → Privacidad y seguridad → Automatización). La app muestra un error claro
  si se deniega.

---

## 7. Rendimiento

| Componente | RAM |
| --- | --- |
| Servidor Next.js | 110–150 MB |
| `whisper-server` cargado | ~740 MB |
| `say` (pico puntual) | < 100 MB |
| **Total en conversación** | **~0,9 GB** |

`whisper-server` se descarga solo tras 10 min de inactividad y al detener la app. No hay modelos
locales de lenguaje ni de embeddings.

---

## 8. Pendiente y no verificado

- **Canva**: sin integración. No se declara conectado.
- **Google Drive / Gmail / Calendar / Notion**: siguen sin OAuth.
- **Micrófono real y altavoces**: la ruta completa se ha probado con audio generado por el sistema;
  falta la prueba con tu voz y el permiso del navegador.
- **Permisos de Automatización de macOS**: los scripts están listos, pero la primera ejecución
  mostrará el diálogo del sistema y hay que aceptarlo.
- **Notificaciones al iPhone**: requieren que configures ntfy o Telegram.
- **Prueba en un iPhone físico**: la autenticación y la PWA se han validado por HTTP simulando un
  host remoto; falta abrirla en el dispositivo.
- **Conversación en tiempo real**: no; latencia ≈ 4 s en caliente.
