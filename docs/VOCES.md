# Voces JARVIS — investigación, pruebas y decisión

Fecha: 19/11/2026 · MacBook Air M4, 16 GB, macOS 27.0.1

Objetivo: sustituir las voces de Apple por una voz masculina, profunda y elegante, sintetizada
localmente, sin ElevenLabs ni servicios de pago, y que funcione en español.

---

## 1. Método

1. Inspección de los dos repositorios propuestos y de sus licencias.
2. Descarga de los modelos en un directorio aislado (`~/Library/Application Support/PersonalAIBrain/voices`).
3. Entorno Python aislado (`venv-voice`) con `piper-tts 1.8.0` y `kokoro-onnx`.
4. Generación de las mismas frases en inglés y español con cada voz.
5. Medición de latencia y memoria.
6. **Prueba objetiva de inteligibilidad**: cada muestra se vuelve a transcribir con whisper.cpp y se
   compara con el texto original. Una voz que pronuncia mal produce una transcripción divergente.

---

## 2. Opción 1 — `jgkawell/jarvis` (Hugging Face)

### Ficha técnica

| Dato | Valor |
| --- | --- |
| Formato | ONNX para Piper (`jarvis-high.onnx`, 109 MB; también medium 60 MB) |
| Idioma | `en_GB` (inglés británico), 1 hablante |
| Frecuencia | 22.050 Hz |
| Fonemizador | `espeak` con voz `en-gb-x-rp` (Received Pronunciation) |
| Entrenamiento | Ajuste fino de la voz `en_US-lessac`; 460 clips del corpus interno `caged` (frases de asistente: “Very good, sir”) |
| Licencia declarada | **MIT** (etiqueta del repositorio) |
| Uso previsto por el autor | Home Assistant / Piper |

### Compatibilidad con macOS Apple Silicon

Sí. `piper-tts 1.8.0` publica un wheel `cp39-abi3-macosx_11_0_arm64` con ONNX Runtime y espeak-ng
incluidos; no requiere compilación. Instalado en un venv con Python 3.13 y verificado con el modelo
`high`.

### Resultados

| Prueba | Resultado |
| --- | --- |
| Inglés (transcripción de la propia muestra) | “Good evening. Both systems are operational. Shall I prepare your briefing?” — **inteligible** |
| Español (misma frase traducida) | “UNAS Notches. Todos los sistemas operativos preparados en 4.” — **ininteligible** |
| Latencia de síntesis (frase de 2–3 s) | 1,5 – 1,7 s en caliente |
| RAM | ~540 MB |
| Arranque en frío | 0,25 s tras corregir una resolución DNS inversa de `HTTPServer` |

**Motivo técnico**: el modelo lleva fijado el fonemizador `en-gb-x-rp` en su `.onnx.json`. Piper no
permite cambiar de idioma en inferencia; al enviar texto español se aplican reglas inglesas
(“Buenas noches” → “UNAS Notches”). No es un problema de acentos ni de velocidad: es estructural.

**Conclusión**: excelente para inglés, **no utilizable en español**.

---

## 3. Opción 2 — `github.com/bluematter/jarvis`

No es un modelo de voz. Es un HUD/bridge que conversa con Claude Code y usa para hablar las voces
**Daniel** y **George** del sistema macOS (las que el usuario quiere evitar). No aporta ningún modelo
de voz reutilizable, así que se descarta como fuente de voz. Se revisó su arquitectura por si tenía
algo aprovechable (detección de palmas, wake word, HUD); nuestro asistente ya cubre esas funciones.

---

## 4. Comparación con Kokoro (voces británicas y españolas)

Kokoro-82M (hexgrad) es **Apache-2.0**, multilingüe y se distribuye como ONNX de 310 MB. Voces
probadas:

| Voz | Idioma | Transcripción automática de la muestra | Inteligible |
| --- | --- | --- | --- |
| `bm_george` | en-GB | “Good evening, all systems are operational. Shall I prepare your briefing?” | ✅ |
| `bm_lewis` | en-GB | idéntica | ✅ |
| `bm_fable` | en-GB | idéntica | ✅ |
| `bm_daniel` | en-GB | idéntica | ✅ |
| `em_alex` | es | “Buenas noches. Todos los sistemas están operativos. Preparo tu informe.” | ✅ |
| `em_santa` | es | idéntica | ✅ |
| `jarvis-high` (Piper) | es | “UNAS Notches… preparados en 4” | ❌ |

| Métrica | Kokoro | Piper JARVIS | macOS `say` |
| --- | --- | --- | --- |
| Modelo | 310 MB | 109 MB | sistema |
| Frecuencia | 24 kHz | 22,05 kHz | 22 kHz |
| Síntesis (frase corta) | 0,9 – 1,7 s | 1,5 – 1,7 s | 1,3 – 1,9 s |
| RAM con modelo cargado | ~620 MB | ~540 MB | < 100 MB |
| Español | ✅ natural | ❌ | ✅ |
| Inglés británico masculino | ✅ 4 voces | ✅ (la más “JARVIS”) | ⚠️ limitado |
| Licencia | Apache-2.0 | MIT declarada | sistema |

---

## 5. Licencias y procedencia (importante)

- **Kokoro-82M**: Apache-2.0 según el proyecto original. Es la opción con licencia más clara para
  uso personal y comercial. Aun así, la procedencia de la identidad de cada voz (timbre) debe
  revisarse si se usa comercialmente.
- **jgkawell/jarvis**: el autor declara **MIT**. La muestra de entrenamiento son 460 clips del corpus
  “caged” (frases de asistente), **no audio de las películas**. Aun así, el timbre imita a un
  personaje de ficción: para uso personal es razonable; para un producto comercial habría que revisar
  derechos de voz e imagen. No se ha usado para español por motivos técnicos, no legales.
- **Voces de macOS**: licencia del sistema; uso personal permitido en el Mac.

---

## 6. Decisión adoptada

| Idioma | Motor | Voz por defecto | Motivo |
| --- | --- | --- | --- |
| Español | Kokoro | `em_alex` | Natural, inteligible, Apache-2.0 |
| Inglés | Kokoro | `bm_george` | Británica, profunda, inteligible |
| Inglés (alternativa) | Piper | `jarvis-high` | La imitación más cercana al JARVIS cinematográfico |
| Respaldo | macOS | `Mónica` | Si el motor local no está disponible |

La voz JARVIS de Piper **no se activa en español**; queda disponible para inglés y se explica en la
interfaz. Todo es configurable y reversible desde **Voces**.

---

## 7. Integración

- `scripts/voice_worker.py`: servidor local (127.0.0.1:8100) que mantiene **un solo motor cargado**
  y sintetiza bajo demanda. Cambiar de motor descarga el anterior (RAM ~620 MB, no la suma).
- `src/lib/voice/engines.ts`: catálogo de voces, detección de idioma, caché por hash, arranque
  perezoso y **descarga del motor tras 10 minutos sin uso**.
- `src/lib/voice/tts.ts`: elige motor y voz según el idioma del texto; conserva `say` como respaldo.
- `POST /api/voice/warm`: precarga el motor al abrir la pantalla de JARVIS para que la primera
  respuesta no pague el arranque.
- `GET /api/voice/engines`, `POST /api/voice/preview`, `PUT /api/voice/selection`: catálogo, muestras
  y activación.
- Página **Voces**: escuchar cada candidata con la misma frase, ver latencia real, licencia y RAM, y
  activarla. También detecta voces Piper personalizadas.

El texto sigue enviándose a NVIDIA para razonar; el **audio nunca sale del Mac**.

---

## 8. Cómo escuchar y elegir

1. Abre **Voces** en la barra lateral.
2. Pestaña **Español**: escucha *Álex*, *Santa* y, como demostración, *JARVIS en español* (oír la
   diferencia ayuda a entender por qué se descarta).
3. Pestaña **Inglés**: escucha *George*, *Lewis*, *Fable* y *JARVIS original*.
4. Pulsa **Activar** en la que prefieras para cada idioma.
5. Prueba en **JARVIS** con una frase real.

Las muestras también quedan en
`~/Library/Application Support/PersonalAIBrain/voices/samples/` para abrirlas con QuickTime.

---

## 9. Voz propia (VoiceStudio u otra)

Cualquier voz Piper se puede añadir sin tocar código:

```
~/Library/Application Support/PersonalAIBrain/voices/piper/<nombre>/
    <nombre>.onnx
    <nombre>.onnx.json
```

La página **Voces** la detecta automáticamente. Si algún día se genera una voz original con
VoiceStudio, se integra por esta vía. VoiceStudio no forma parte de este repositorio ni se instala
automáticamente.

---

## 10. Reproducir la instalación

```bash
bash scripts/install-voices.sh
```

Crea el venv aislado, instala `piper-tts` y `kokoro-onnx`, y descarga Kokoro + la voz JARVIS
(≈ 450 MB). Es idempotente y no toca el sistema.
