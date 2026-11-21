"use client";

import { useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { PageHeader, Spinner, Toast } from "@/components/ui";

export default function SaludPage() {
  const { data, reload, loading } = useApi<any>("/api/salud", 0);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [analito, setAnalito] = useState("colesterol");
  const [serie, setSerie] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4500);
  };

  const toggle = async (habilitar: boolean) => {
    try {
      await api("/api/salud", { method: "POST", body: JSON.stringify({ habilitar }) });
      notify(habilitar ? "Memoria de salud activada" : "Memoria de salud desactivada", "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const importar = async () => {
    if (!file || !consent) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("consentimiento", "true");
      const r = await api<any>("/api/salud", { method: "POST", body: form });
      notify(`Informe procesado: ${r.parametros} parámetros`, "ok");
      setFile(null);
      setConsent(false);
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const buscarTendencia = async () => {
    try {
      setSerie(await api(`/api/salud?analito=${encodeURIComponent(analito)}`));
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const abrir = async (id: string) => setDetalle(await api(`/api/salud?estudio=${id}`));

  const borrar = async (id: string) => {
    if (!confirm("¿Eliminar este informe y todos sus resultados de forma permanente?")) return;
    try {
      await api(`/api/salud?id=${id}`, { method: "DELETE" });
      notify("Informe eliminado", "ok");
      setDetalle(null);
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const habilitada = Boolean(data?.habilitada);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7">
      <PageHeader
        title="Salud"
        subtitle="Memoria médica aislada: solo se activa con tu permiso y solo compara lo que tú aportas."
      />

      <section className={`card mb-4 p-4 ${habilitada ? "" : "border-amber-500/25"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-mist-100">Memoria de salud {habilitada ? "activada" : "desactivada"}</div>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-mist-400">
              Los informes se analizan con NVIDIA (texto e imagen). Se guardan cifrados en tu Mac y nunca se usan para
              publicidad ni perfiles. JARVIS no diagnostica ni modifica tratamientos: solo extrae, ordena y compara.
            </p>
          </div>
          <button className={habilitada ? "btn-ghost text-xs" : "btn-primary text-xs"} onClick={() => void toggle(!habilitada)}>
            {habilitada ? "Desactivar" : "Activar con consentimiento"}
          </button>
        </div>
      </section>

      {habilitada && (
        <section className="card mb-4 p-4">
          <h2 className="h2 mb-2">Incorporar un informe</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".pdf,.txt,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-mist-300"
            />
            <label className="flex items-center gap-2 text-[11px] text-mist-300">
              <input type="checkbox" className="h-3.5 w-3.5 accent-[#35e0c4]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Autorizo el análisis de este informe y el envío de su contenido a NVIDIA.
            </label>
            <button className="btn-primary text-xs" disabled={!file || !consent || busy} onClick={() => void importar()}>
              {busy ? <Spinner /> : "Procesar"}
            </button>
          </div>
        </section>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-mist-400">Estudios</div>
          <div className="text-xl font-semibold text-white">{data?.estudios?.length ?? 0}</div>
        </div>
        <div className="card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-mist-400">Parámetros</div>
          <div className="text-xl font-semibold text-white">{data?.parametros ?? 0}</div>
        </div>
        <div className="card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-mist-400">Fuera de rango</div>
          <div className="text-xl font-semibold text-amber-300">{data?.fuera_de_rango ?? 0}</div>
        </div>
      </div>

      <section className="card mb-4 p-4">
        <h2 className="h2 mb-2">Evolución de un parámetro</h2>
        <div className="flex flex-wrap gap-2">
          <input className="input w-64" value={analito} onChange={(e) => setAnalito(e.target.value)} placeholder="colesterol total" />
          <button className="btn-ghost text-xs" onClick={() => void buscarTendencia()}>
            Ver evolución
          </button>
        </div>
        {serie && (
          <div className="mt-3">
            {serie.aviso && <div className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">{serie.aviso}</div>}
            {serie.serie.length > 0 && (
              <>
                <Chart serie={serie.serie} />
                <table className="mt-3 w-full text-left text-[11px]">
                  <thead className="text-mist-400">
                    <tr>
                      <th className="py-1 pr-4">Fecha</th>
                      <th className="py-1 pr-4">Valor</th>
                      <th className="py-1 pr-4">Unidad</th>
                      <th className="py-1 pr-4">Rango</th>
                      <th className="py-1">Laboratorio</th>
                    </tr>
                  </thead>
                  <tbody className="text-mist-300">
                    {serie.serie.map((p: any, i: number) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-1 pr-4">{p.fecha}</td>
                        <td className="py-1 pr-4 font-mono">{p.valor}</td>
                        <td className="py-1 pr-4">{p.unidad || "—"}</td>
                        <td className="py-1 pr-4">
                          {p.ref_low ?? "?"} – {p.ref_high ?? "?"}
                        </td>
                        <td className="py-1">{p.laboratorio || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="h2 mb-2">Informes</h2>
        {loading && !data ? (
          <div className="flex items-center gap-2 text-mist-400">
            <Spinner /> Cargando…
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.estudios ?? []).map((e: any) => (
              <button key={e.id} className="card card-hover flex w-full items-center gap-3 p-3 text-left" onClick={() => void abrir(e.id)}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-mist-100">{e.lab || "Informe de laboratorio"}</div>
                  <div className="text-[10px] text-mist-400">
                    {e.taken_at} · {e.parametros} parámetros · {formatDate(e.created_at)}
                  </div>
                </div>
                <span className="text-[10px] text-mist-400">ver</span>
              </button>
            ))}
            {(data?.estudios ?? []).length === 0 && (
              <div className="card px-4 py-10 text-center text-sm text-mist-400">
                No hay informes. Activa la memoria de salud e incorpora un análisis.
              </div>
            )}
          </div>
        )}
      </section>

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetalle(null)} />
          <div className="card relative max-h-[85vh] w-full max-w-2xl overflow-auto p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{detalle.estudio.lab || "Informe"}</h3>
                <div className="text-[11px] text-mist-400">{detalle.estudio.taken_at}</div>
              </div>
              <button className="btn-danger text-xs" onClick={() => void borrar(detalle.estudio.id)}>
                Eliminar
              </button>
            </div>
            <table className="mt-3 w-full text-left text-[11px]">
              <thead className="text-mist-400">
                <tr>
                  <th className="py-1 pr-3">Parámetro</th>
                  <th className="py-1 pr-3">Valor</th>
                  <th className="py-1 pr-3">Unidad</th>
                  <th className="py-1">Rango</th>
                </tr>
              </thead>
              <tbody className="text-mist-300">
                {detalle.resultados.map((r: any, i: number) => {
                  const out =
                    r.value != null && ((r.ref_high != null && r.value > r.ref_high) || (r.ref_low != null && r.value < r.ref_low));
                  return (
                    <tr key={i} className="border-t border-white/5">
                      <td className="py-1 pr-3">{r.analyte}</td>
                      <td className={`py-1 pr-3 font-mono ${out ? "text-amber-300" : ""}`}>{r.value ?? "—"}</td>
                      <td className="py-1 pr-3">{r.unit || "—"}</td>
                      <td className="py-1">
                        {r.ref_low ?? "?"} – {r.ref_high ?? "?"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="btn-ghost mt-4 text-xs" onClick={() => setDetalle(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}

function Chart({ serie }: { serie: Array<{ valor: number; ref_low: number | null; ref_high: number | null }> }) {
  const values = serie.map((p) => p.valor);
  const lows = serie.map((p) => p.ref_low).filter((v): v is number => v != null);
  const highs = serie.map((p) => p.ref_high).filter((v): v is number => v != null);
  const all = [...values, ...lows, ...highs];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.15 || 1;
  const w = 640;
  const h = 160;
  const x = (i: number) => 20 + (i * (w - 40)) / Math.max(1, serie.length - 1);
  const y = (v: number) => h - 20 - ((v - (min - pad)) * (h - 40)) / (max - min + pad * 2);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const refHigh = highs.length === serie.length ? highs : null;
  const refLow = lows.length === serie.length ? lows : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-lg bg-ink-950/50">
      {refHigh && refLow && (
        <rect
          x={20}
          y={y(refHigh[0])}
          width={w - 40}
          height={Math.max(2, y(refLow[0]) - y(refHigh[0]))}
          fill="rgba(53,224,196,0.08)"
        />
      )}
      <path d={path} fill="none" stroke="#35e0c4" strokeWidth="2.5" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="#35e0c4" />
      ))}
    </svg>
  );
}
