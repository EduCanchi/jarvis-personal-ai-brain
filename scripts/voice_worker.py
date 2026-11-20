#!/usr/bin/env python3
"""Servidor local de síntesis de voz para JARVIS.

Mantiene un único motor cargado (Kokoro u Piper) y sintetiza bajo demanda.
Se ejecuta con el venv aislado de la app y solo escucha en 127.0.0.1.

Uso:
  python voice_worker.py --port 8100 --kokoro-dir ... --piper-dir ...
"""
from __future__ import annotations

import argparse
import gc
import io
import json
import os
import resource
import sys
import threading
import time
import wave
import socketserver
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

LOCK = threading.Lock()

STATE = {
    "engine": None,          # "kokoro" | "piper"
    "kokoro": None,
    "piper": None,
    "piper_id": None,
    "loaded_at": None,
    "load_ms": 0,
}

ARGS = None


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)


def load_kokoro():
    if STATE["kokoro"] is not None:
        return STATE["kokoro"]
    from kokoro_onnx import Kokoro

    if STATE["piper"] is not None:
        STATE["piper"] = None
        STATE["piper_id"] = None
        gc.collect()
    t0 = time.time()
    STATE["kokoro"] = Kokoro(
        os.path.join(ARGS.kokoro_dir, "kokoro-v1.0.onnx"),
        os.path.join(ARGS.kokoro_dir, "voices-v1.0.bin"),
    )
    STATE["load_ms"] = int((time.time() - t0) * 1000)
    STATE["engine"] = "kokoro"
    STATE["loaded_at"] = time.time()
    return STATE["kokoro"]


def load_piper(voice_id: str):
    from piper import PiperVoice

    if STATE["piper"] is not None and STATE["piper_id"] == voice_id:
        return STATE["piper"]
    STATE["piper"] = None
    STATE["piper_id"] = None
    base = os.path.join(ARGS.piper_dir, voice_id)
    model = os.path.join(base, f"{voice_id}.onnx")
    if not os.path.exists(model):
        candidates = [f for f in os.listdir(base) if f.endswith(".onnx")] if os.path.isdir(base) else []
        if not candidates:
            raise FileNotFoundError(f"No hay modelo ONNX para la voz '{voice_id}' en {base}")
        model = os.path.join(base, candidates[0])
    if STATE["kokoro"] is not None:
        STATE["kokoro"] = None
        gc.collect()
    t0 = time.time()
    STATE["piper"] = PiperVoice.load(model)
    STATE["piper_id"] = voice_id
    STATE["load_ms"] = int((time.time() - t0) * 1000)
    STATE["engine"] = "piper"
    STATE["loaded_at"] = time.time()
    return STATE["piper"]


def to_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    pcm = np.clip(samples, -1.0, 1.0)
    int16 = (pcm * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(int16.tobytes())
    return buf.getvalue()


def synth(payload: dict) -> tuple[bytes, dict]:
    text = (payload.get("text") or "").strip()
    if not text:
        raise ValueError("texto vacío")
    engine = payload.get("engine") or "kokoro"
    voice = payload.get("voice") or "em_alex"
    lang = payload.get("lang") or "es"
    if lang == "en":
        lang = "en-gb"
    speed = float(payload.get("speed") or 1.0)
    speed = max(0.5, min(2.0, speed))
    t0 = time.time()

    with LOCK:
        if engine == "piper":
            voice_obj = load_piper(voice)
            from piper.config import SynthesisConfig

            cfg = SynthesisConfig(length_scale=1.0 / speed)
            chunks = list(voice_obj.synthesize(text, syn_config=cfg))
            if not chunks:
                raise RuntimeError("piper no devolvió audio")
            rate = chunks[0].sample_rate
            audio = np.concatenate(
                [np.frombuffer(c.audio_int16_bytes, dtype=np.int16).astype(np.float32) / 32768.0 for c in chunks]
            )
        else:
            k = load_kokoro()
            audio, rate = k.create(text, voice=voice, speed=speed, lang=lang)
            audio = np.asarray(audio, dtype=np.float32)

        wav = to_wav(audio, rate)
        meta = {
            "engine": engine,
            "voice": voice,
            "lang": lang,
            "sample_rate": int(rate),
            "duration_s": round(len(audio) / rate, 3),
            "synth_ms": int((time.time() - t0) * 1000),
            "load_ms": STATE["load_ms"],
            "rss_mb": round(rss_mb(), 1),
        }
    return wav, meta


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # silencio: los logs los gestiona Node
        pass

    def _json(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {
                "ok": True,
                "engine": STATE["engine"],
                "load_ms": STATE["load_ms"],
                "rss_mb": round(rss_mb(), 1),
                "voices_piper": sorted(os.listdir(ARGS.piper_dir)) if os.path.isdir(ARGS.piper_dir) else [],
            })
        else:
            self._json(404, {"error": "no encontrado"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "JSON inválido"})

        if self.path == "/unload":
            with LOCK:
                STATE["kokoro"] = None
                STATE["piper"] = None
                STATE["piper_id"] = None
                STATE["engine"] = None
            return self._json(200, {"ok": True})

        if self.path != "/synth":
            return self._json(404, {"error": "no encontrado"})

        try:
            wav, meta = synth(payload)
        except Exception as exc:  # noqa: BLE001
            return self._json(500, {"error": f"{type(exc).__name__}: {exc}"})

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.send_header("X-Voice-Meta", json.dumps(meta))
        self.end_headers()
        self.wfile.write(wav)


class Server(ThreadingHTTPServer):
    """Evita la resolución inversa de DNS de HTTPServer (puede tardar 30 s en macOS)."""

    allow_reuse_address = True
    daemon_threads = True

    def server_bind(self):
        socketserver.TCPServer.server_bind(self)
        host, port = self.server_address[:2]
        self.server_name = "localhost"
        self.server_port = port


def main():
    global ARGS
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8100)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--kokoro-dir", required=True)
    parser.add_argument("--piper-dir", required=True)
    ARGS = parser.parse_args()
    server = Server((ARGS.host, ARGS.port), Handler)
    print(f"voice-worker listo en http://{ARGS.host}:{ARGS.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.exit(main())
