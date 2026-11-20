"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/asistente", label: "JARVIS", icon: "voice" },
  { href: "/cerebro", label: "Cerebro visual", icon: "brain" },
  { href: "/chat", label: "Chat IA", icon: "chat" },
  { href: "/biblioteca", label: "Biblioteca", icon: "book" },
  { href: "/memoria", label: "Memoria", icon: "memory" },
  { href: "/herramientas", label: "Herramientas", icon: "tool" },
  { href: "/automatizaciones", label: "Automatizaciones", icon: "clock" },
  { href: "/conexiones", label: "Conexiones", icon: "plug" },
  { href: "/configuracion", label: "Configuración", icon: "gear" },
];

function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "brain":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <circle cx="5" cy="6" r="2" />
          <circle cx="19" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M9.5 10.5 6.5 7.5M14.5 10.5l3-3M9.5 13.5l-3 3M14.5 13.5l3 3" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
          <path d="M8 11h8M8 15h5" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
          <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5Z" />
        </svg>
      );
    case "memory":
      return (
        <svg {...common}>
          <path d="M12 3a4 4 0 0 0-4 4v1a3 3 0 0 0 0 6v1a4 4 0 0 0 8 0v-1a3 3 0 0 0 0-6V7a4 4 0 0 0-4-4Z" />
          <path d="M12 7v10" />
        </svg>
      );
    case "plug":
      return (
        <svg {...common}>
          <path d="M9 3v6M15 3v6M6 9h12v3a6 6 0 0 1-12 0Z" />
          <path d="M12 18v3" />
        </svg>
      );
    case "voice":
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
        </svg>
      );
    case "tool":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 0 5 5L21 21H3l8.7-8.7a4 4 0 0 0 5-5l-2.6 2.6-2.4-2.4 2.6-2.6Z" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "gear":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    default:
      return null;
  }
}

interface Health {
  clave_configurada: boolean;
  modelo_principal: string;
  memoria_rss_mb: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((d) => alive && setHealth(d))
        .catch(() => {});
    load();
    const timer = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/6 bg-ink-900/60 px-3.5 py-5 backdrop-blur-xl lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-neon-500/25 to-violet-500/25 ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-neon-400" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="2.6" />
            <circle cx="5" cy="6" r="1.6" />
            <circle cx="19" cy="6" r="1.6" />
            <circle cx="5" cy="18" r="1.6" />
            <circle cx="19" cy="18" r="1.6" />
            <path d="M9.9 10.2 6.4 7.2M14.1 10.2l3.5-3M9.9 13.8l-3.5 3M14.1 13.8l3.5 3" />
          </svg>
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight text-white">Personal AI Brain</div>
          <div className="text-[11px] text-mist-400">Cerebro visual local</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-white/[0.07] text-white ring-1 ring-white/10"
                  : "text-mist-300 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <span className={active ? "text-neon-400" : "text-mist-400 group-hover:text-mist-200"}>
                <Icon name={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-white/6 bg-ink-950/60 p-3 text-[11px] leading-relaxed text-mist-400">
        <div className="flex items-center gap-2 text-mist-300">
          <span
            className={`node-dot ${health?.clave_configurada ? "bg-neon-500 live-dot" : "bg-amber-400"}`}
          />
          {health?.clave_configurada ? "NVIDIA conectado" : "Falta la API key"}
        </div>
        <div className="mt-2 truncate font-mono text-[10px] text-mist-400/80">{health?.modelo_principal ?? "—"}</div>
        <div className="mt-1">RAM del servidor: {health?.memoria_rss_mb ?? "—"} MB</div>
      </div>
    </aside>
  );
}
