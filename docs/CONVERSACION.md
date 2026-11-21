# Conversación hablada — corrección de la fase 1

Fecha: 21/11/2026 · MacBook Air M4, 16 GB

## 1. Máquina de estados

| Estado | Qué ocurre | Salida |
| --- | --- | --- |
| `reposo` | micrófono apagado (o esperando la palabra en manos libres) | decir «Jarvis» / pulsar el orbe |
| `activación` | se detecta la palabra y se abre la sesión | «Te escucho» y pasa a escucha |
| `escucha` | graba con VAD; silencio configurable (1,6 s) antes de cerrar el turno | transcripción |
| `procesamiento` | Nemotron + herramientas | respuesta |
| `respuesta` | TTS por frases; micrófono en modo interrupción | fin del audio o interrupción |
| `interrupción` | el usuario habla mientras JARVIS responde: se corta el audio, se aborta la petición y se transcribe lo nuevo | vuelve a `escucha` |
| `cierre` | «termina», «hasta luego», «eso es todo», botón o inactividad | despedida y `reposo` |

La lógica está en `src/lib/voice/session.ts` (pura y testeable) y la usa la interfaz.

### Reglas implementadas

- La palabra de activación **solo abre la sesión**. Dentro de la sesión no se repite.
- «Jarvis» sola → «Te escucho.»; «Jarvis, ¿qué hora es?» → abre y responde en el mismo turno.
- Se toleran errores del transcriptor: «Yarvis», «Jarvi».
- Cierre por frase exacta (admite «vale, termina»), por botón o por inactividad (60 s por defecto).
- La inactividad **solo se renueva con actividad real** (voz detectada o respuesta), no al reiniciar el micrófono.
- Mientras JARVIS habla, el micrófono escucha para interrumpir; el audio se pausa, se transcribe lo dicho y se compara con el texto que estaba sonando para descartar eco del propio TTS.
- Si la transcripción es eco (≥60 % de palabras coincidentes), se reanuda la reproducción.

## 2. Reconocimiento: medición real

Audio de prueba: frase con nombres propios, cifras y ruido rosa añadido (7 s).

| Modelo | Latencia | Transcripción | Errores |
| --- | --- | --- | --- |
| `small` + prompt | **1,8 s** | “…Laura Méndez… Guatemala… prepárate un resumen del proyecto Aurora…” | 1 (“prepárate” por “prepárame”) |
| `large-v3-turbo` | **6,2 s** | “…Laura Méndez… prepárame… Aurora… comité financiero” | 0 |
| `medium` | 8–10 s | perfecta | 0 |
| Parakeet (nube) | 1,5 s | perfecta salvo una palabra final perdida | 1 |

**Decisión**: dos modos.
- **Conversación** (por defecto): `small` + prompt de contexto → 1,8–2,7 s.
- **Dictado/preciso**: el modelo que tengas configurado (`large-v3-turbo`) → 6–8 s.
- El modo se elige en Configuración; se puede forzar el preciso también al conversar.

El prompt de contexto (`stt_prompt`) incluye nombres frecuentes y mejoró de forma medible
(“prepárame”, “Aurora”): sin él, `small` fallaba esas palabras.

## 3. Prueba de 10 turnos (API, sin micrófono)

`scripts/conversation-sim.sh` encadena diez intervenciones con seguimiento:

| Turno | Entrada | Respuesta | ms |
| --- | --- | --- | --- |
| 1 | Viaje a Antigua Guatemala del 12 al 18 de diciembre | confirmación con fechas | 2.100 |
| 2 | ¿Qué fechas te he dicho? | 12–18 de diciembre | 1.700 |
| 3 | Presupuesto: 1.200 $ | propone desglose | 2.655 |
| 4 | ¿Cuánto era el presupuesto? | 1.200 dólares | 1.886 |
| 5 | Añade el lago de Atitlán | lo incorpora al plan | 7.298 |
| 6 | ¿Qué plan tenemos? | fechas + presupuesto + actividad | 3.527 |
| 7 | Mi hermana Lucía viene conmigo | lo registra | 4.420 |
| 8 | ¿Quién viene conmigo? | tu hermana Lucía | 1.552 |
| 9 | Resume en tres puntos | tres puntos correctos | 1.557 |
| 10 | ¿Qué día llegamos? | 12 de diciembre | 2.288 |

Contexto conservado en los diez turnos. Se detectó y corrigió un fallo: el modelo devolvía a veces
la llamada a herramienta como texto; ahora se reconocen también formatos alternativos.

## 4. Qué falta validar contigo

No puedo usar tu micrófono. Lo que sigue requiere tu voz:

1. Activar **Manos libres** y decir «Jarvis».
2. Comprobar que responde «Te escucho» y que **no** vuelve a pedir la palabra.
3. Encadenar 10 preguntas con seguimientos y pausas naturales.
4. Interrumpirle dos veces mientras habla.
5. Decir «Jarvis, termina» y comprobar que cierra.
6. Dejar 60 s de silencio y comprobar el cierre automático.

Métricas que verás en pantalla: STT, tiempo total y tiempo hasta la primera voz.

## 5. Limitaciones conocidas

- La interrupción por voz depende del eco del altavoz; con auriculares es más fiable.
- `small` puede fallar nombres poco comunes; el modo preciso los resuelve a costa de latencia.
- La latencia total por turno sigue en 3–6 s (no se alcanza 1–2 s).
