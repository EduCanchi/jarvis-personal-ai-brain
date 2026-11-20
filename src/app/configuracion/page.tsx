"use client";

import { useEffect, useState } from "react";
import { api, formatBytes, formatDate, useApi } from "@/lib/client";
import { PageHeader, Spinner, Toast } from "@/components/ui";

interface ModelEntry {
  role: string;
  defaultId: string;
  requestedId: string;
  purpose: string;
  note?: string;
  actual: string;
}

interface Health {
  role: string;
  model: string;
  disponible: boolean;
  probado: boolean;
  latencia_ms?: number;
  detalle: string;
}

export default function ConfiguracionPage() {
  const { data: models, reload: reloadModels } = useApi<{ registry: ModelEntry[]; catalogo: { ids: string[]; error?: string } }>(
    "/api/models",
    0,
  );
  const { data: settingsData, reload: reloadSettings } = useApi<{ settings: Record<string, string> }>("/api/settings", 0);
  const { data: keysData, reload: reloadKeys } = useApi<{ configurada: boolean; origen: string }>("/api/keys", 0);
  const { data: backupsData, reload: reloadBackups } = useApi<{ backups: Array<{ file: string; size: number; created_at: string }> }>(
    "/api/backup",
    0,
  );
  const { data: healthData } = useApi<{ sistema: { directorio_datos: string } }>("/api/stats", 0);

  const [keyInput, setKeyInput] = useState("");
  const [health, setHealth] = useState<Health[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsData?.settings) setLocal(settingsData.settings);
  }, [settingsData]);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4200);
  };

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setBusy("key");
    try {
      const result = await api<{ almacenamiento: string }>("/api/keys", {
        method: "POST",
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      setKeyInput("");
      notify(`Clave guardada en ${result.almacenamiento}`, "ok");
      await reloadKeys();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const deleteKey = async () => {
    if (!confirm("¿Eliminar la clave de NVIDIA de este Mac?")) return;
    try {
      await api("/api/keys", { method: "DELETE" });
      notify("Clave eliminada", "ok");
      await reloadKeys();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const runHealth = async () => {
    setTesting(true);
    try {
      const result = await api<{ health: Health[] }>("/api/models", {
        method: "POST",
        body: JSON.stringify({ action: "probar" }),
      });
      setHealth(result.health);
      notify("Comprobación completada", "ok");
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setTesting(false);
    }
  };

  const changeModel = async (role: string, model: string) => {
    setBusy(role);
    try {
      await api("/api/models", { method: "POST", body: JSON.stringify({ role, model }) });
      notify("Modelo actualizado", "ok");
      await reloadModels();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (patch: Record<string, string>) => {
    setBusy("settings");
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
      setLocal((prev) => ({ ...prev, ...patch }));
      notify("Configuración guardada", "ok");
      await reloadSettings();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const makeBackup = async () => {
    setBusy("backup");
    try {
      await api("/api/backup", { method: "POST" });
      notify("Respaldo creado", "ok");
      await reloadBackups();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file: string) => {
    if (!confirm("Se reemplazará la base de datos actual por la del respaldo. Se creará antes un respaldo de seguridad. ¿Continuar?")) return;
    setBusy("restore");
    try {
      const result = await api<{ message: string }>("/api/restore", {
        method: "POST",
        body: JSON.stringify({ file, confirm: true }),
      });
      notify(result.message, "ok");
      await reloadBackups();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const s = local;

  return (
    <div className="mx-auto max-w-[1000px] px-7 py-7">
      <PageHeader title="Configuración" subtitle="API, modelos, privacidad, rendimiento y respaldos." />

      <section className="card mb-4 p-5">
        <h2 className="h2 mb-1">Clave de NVIDIA Build</h2>
        <p className="mb-3 text-xs text-mist-400">
          Se guarda en el Llavero de macOS (o en un archivo con permisos 0600 si el Llavero no está disponible). Nunca se
          muestra de nuevo ni se escribe en el repositorio.
        </p>
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className={`node-dot ${keysData?.configurada ? "bg-neon-500" : "bg-amber-400"}`} />
          <span className="text-mist-300">
            {keysData?.configurada ? `Configurada (${keysData.origen})` : "No configurada"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[280px] font-mono text-xs"
            type="password"
            autoComplete="off"
            placeholder="nvapi-…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button className="btn-primary" onClick={() => void saveKey()} disabled={busy === "key" || !keyInput.trim()}>
            {busy === "key" ? <Spinner /> : "Guardar clave"}
          </button>
          <button className="btn-ghost" onClick={() => void deleteKey()} disabled={!keysData?.configurada}>
            Eliminar
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-amber-200/80">
          Aviso de privacidad: los documentos y preguntas que se procesan con los modelos se envían a NVIDIA Build y se
          procesan fuera de tu Mac. Puedes desactivar todo el procesamiento remoto más abajo o excluir documentos concretos
          desde la Biblioteca.
        </p>
      </section>

      <section className="card mb-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Modelos</h2>
          <button className="btn-ghost text-xs" onClick={() => void runHealth()} disabled={testing || !keysData?.configurada}>
            {testing ? <Spinner /> : "Probar conexión real"}
          </button>
        </div>
        {models?.catalogo.error && (
          <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            {models.catalogo.error}
          </div>
        )}
        <div className="space-y-3">
          {(models?.registry ?? []).map((m) => (
            <div key={m.role} className="rounded-xl border border-white/6 bg-white/[0.02] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium capitalize text-mist-100">{m.role}</div>
                <div className="text-[10px] text-mist-400">
                  {models?.catalogo.ids.length ?? 0} modelos disponibles en la cuenta
                </div>
              </div>
              <p className="mt-1 text-[11px] text-mist-400">{m.purpose}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  className="input flex-1 min-w-[260px] font-mono text-[11px]"
                  value={m.actual}
                  onChange={(e) => void changeModel(m.role, e.target.value)}
                  disabled={busy === m.role}
                >
                  {!models?.catalogo.ids.includes(m.actual) && <option value={m.actual}>{m.actual} (no verificado)</option>}
                  {(models?.catalogo.ids ?? []).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
              {m.note && <p className="mt-2 text-[10px] leading-relaxed text-mist-400">{m.note}</p>}
              {m.requestedId !== m.defaultId && (
                <p className="mt-1 text-[10px] text-amber-300/80">Solicitado originalmente: {m.requestedId}</p>
              )}
            </div>
          ))}
        </div>

        {health && (
          <div className="mt-4 space-y-2">
            {health.map((h) => (
              <div key={h.role} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/6 px-3 py-2 text-[11px]">
                <span className={`node-dot ${h.probado ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="w-20 capitalize text-mist-300">{h.role}</span>
                <span className="font-mono text-mist-400">{h.model}</span>
                <span className="ml-auto text-mist-400">{h.latencia_ms ? `${h.latencia_ms} ms` : ""}</span>
                <span className={h.probado ? "text-emerald-300" : "text-red-300"}>{h.detalle}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mb-4 p-5">
        <h2 className="h2 mb-3">Privacidad</h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[#35e0c4]"
            checked={s.procesamiento_remoto === "true"}
            onChange={(e) => void saveSettings({ procesamiento_remoto: String(e.target.checked) })}
          />
          <span className="text-sm text-mist-200">
            Permitir procesamiento remoto en NVIDIA Build
            <span className="mt-0.5 block text-[11px] text-mist-400">
              Si lo desactivas, solo se indexará el texto localmente (FTS5). No habrá visión, embeddings ni extracción de
              entidades hasta que lo vuelvas a activar.
            </span>
          </span>
        </label>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="h2 mb-3">Rendimiento</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Concurrencia de peticiones</label>
            <input
              className="input"
              type="number"
              min={1}
              max={8}
              value={s.concurrencia ?? "2"}
              onChange={(e) => setLocal({ ...s, concurrencia: e.target.value })}
              onBlur={(e) => void saveSettings({ concurrencia: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Tokens máximos de respuesta</label>
            <input
              className="input"
              type="number"
              min={512}
              max={32768}
              step={512}
              value={s.max_tokens ?? "8192"}
              onChange={(e) => setLocal({ ...s, max_tokens: e.target.value })}
              onBlur={(e) => void saveSettings({ max_tokens: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Tamaño de fragmento (caracteres)</label>
            <input
              className="input"
              type="number"
              min={400}
              max={6000}
              step={100}
              value={s.tamano_fragmento ?? "1400"}
              onChange={(e) => setLocal({ ...s, tamano_fragmento: e.target.value })}
              onBlur={(e) => void saveSettings({ tamano_fragmento: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Temperatura</label>
            <input
              className="input"
              type="number"
              min={0}
              max={1.5}
              step={0.1}
              value={s.temperatura ?? "0.3"}
              onChange={(e) => setLocal({ ...s, temperatura: e.target.value })}
              onBlur={(e) => void saveSettings({ temperatura: e.target.value })}
            />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-mist-200">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#35e0c4]"
            checked={s.razonamiento_visible === "true"}
            onChange={(e) => void saveSettings({ razonamiento_visible: String(e.target.checked) })}
          />
          Mostrar razonamiento del modelo en el chat
        </label>
      </section>

      <section className="card mb-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Respaldos</h2>
          <button className="btn-primary text-xs" onClick={() => void makeBackup()} disabled={busy === "backup"}>
            {busy === "backup" ? <Spinner /> : "Crear respaldo"}
          </button>
        </div>
        <p className="mb-3 text-[11px] text-mist-400">
          Incluye la base de datos (instantánea consistente) y los archivos originales. Se guardan en el directorio de datos.
        </p>
        <div className="space-y-2">
          {(backupsData?.backups ?? []).map((b) => (
            <div key={b.file} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/6 px-3 py-2 text-[11px]">
              <span className="truncate font-mono text-mist-300">{b.file.split("/").pop()}</span>
              <span className="text-mist-400">{formatBytes(b.size)}</span>
              <span className="text-mist-400">{formatDate(b.created_at)}</span>
              <button
                className="ml-auto rounded-md border border-white/10 px-2 py-1 text-mist-300 hover:border-red-500/30 hover:text-red-300"
                onClick={() => void restore(b.file)}
                disabled={busy === "restore"}
              >
                Restaurar
              </button>
            </div>
          ))}
          {(backupsData?.backups ?? []).length === 0 && <div className="text-xs text-mist-400">Todavía no hay respaldos.</div>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="h2 mb-2">Datos y sistema</h2>
        <div className="space-y-1 font-mono text-[11px] text-mist-400">
          <div>Directorio de datos: {healthData?.sistema?.directorio_datos ?? "—"}</div>
          <div>Servidor escuchando solo en 127.0.0.1:4317</div>
          <div>Base de datos: SQLite con FTS5 · embeddings almacenados localmente</div>
        </div>
      </section>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
