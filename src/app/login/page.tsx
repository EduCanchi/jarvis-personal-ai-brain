"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo iniciar sesión");
      router.replace(params.get("next") || "/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="node-dot bg-neon-500 live-dot" />
          <h1 className="text-lg font-semibold text-white">JARVIS · acceso remoto</h1>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-mist-400">
          Introduce el token de acceso que aparece en Configuración → Acceso remoto de tu Mac. Se guarda en esta
          instalación del navegador.
        </p>
        <label className="label">Token de acceso</label>
        <input
          className="input font-mono text-xs"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="pega aquí el token"
        />
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <button className="btn-primary mt-4 w-full" disabled={loading || !token.trim()}>
          {loading ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
