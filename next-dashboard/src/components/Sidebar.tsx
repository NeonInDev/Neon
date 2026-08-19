"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useModo } from "./ModeProvider";

const itens = [
  { href: "/", label: "Chat", icon: "💬" },
  { href: "/pc", label: "Painel do PC", icon: "🖥️" },
  { href: "/celular", label: "Celular", icon: "📱" },
  { href: "/terminal", label: "Terminal", icon: "⌨️" },
  { href: "/arquivos", label: "Arquivos", icon: "📁" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { modo, trocar } = useModo();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-5">
        <div className="text-lg font-bold tracking-widest">NEON</div>
        <div className="text-xs text-[var(--dim)]">painel de controle</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {itens.map((i) => {
          const ativo = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                ativo
                  ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "text-[var(--dim)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
              }`}
            >
              <span>{i.icon}</span>
              {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] p-3">
        <button
          onClick={trocar}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-dim)]"
        >
          MODO: {modo.toUpperCase()}
        </button>
        <div className="mt-2 text-center text-[11px] text-[var(--dim)]">
          {modo === "ultron" ? "☠️ eu nunca falho duas vezes" : "🟦 sistemas calmos"}
        </div>
      </div>
    </aside>
  );
}
