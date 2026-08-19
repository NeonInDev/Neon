"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  conectado?: boolean;
  ip?: string;
  porta?: number;
  erro?: string;
};

export function CelularPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [app, setApp] = useState("");
  const [shot, setShot] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/neon/celular");
      if (!r.ok) throw new Error("status");
      setStatus(await r.json());
    } catch {
      setStatus({ conectado: false });
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 8000);
    return () => clearInterval(t);
  }, [carregar]);

  async function acao(caminho: string, body?: object) {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/neon/celular/${caminho}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) setMsg(d.erro || d.mensagem || "Falha");
      else if (d.imagem) setShot(d.imagem);
      else setMsg(d.mensagem || "ok");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      carregar();
    }
  }

  const online = status?.conectado;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Celular</h1>
          <p className="text-xs text-[var(--dim)]">controle via adb / scrcpy</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-[var(--good)]" : "bg-[var(--bad)]"}`}
          />
          <span className={online ? "text-[var(--good)]" : "text-[var(--bad)]"}>
            {online ? "CONECTADO" : "DESCONECTADO"}
          </span>
        </div>
      </div>

      {status?.ip && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-4 text-sm">
          <span className="text-[var(--dim)]">Alvo adb: </span>
          <span className="font-mono font-semibold">
            {status.ip}:{status.porta ?? 5555}
          </span>
          {status.erro && <div className="mt-1 text-xs text-[var(--bad)]">{status.erro}</div>}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => acao("conectar")}
          disabled={loading}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          📱 Conectar
        </button>
        <button
          onClick={() => acao("desconectar")}
          disabled={loading}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          ⏹️ Desconectar
        </button>
        <button
          onClick={() => acao("espelhar")}
          disabled={loading}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          🖥️ Espelhar (scrcpy)
        </button>
        <button
          onClick={() => acao("print")}
          disabled={loading}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          📸 Print da tela
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-4">
        <div className="mb-2 text-sm text-[var(--dim)]">Abrir app no celular</div>
        <div className="flex gap-2">
          <input
            value={app}
            onChange={(e) => setApp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && app.trim() && acao("abrir", { app: app.trim() })}
            placeholder="whatsapp, youtube, instagram..."
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={() => app.trim() && acao("abrir", { app: app.trim() })}
            disabled={loading || !app.trim()}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            Abrir
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-3 text-sm">{msg}</div>
      )}

      {shot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setShot(null)}
        >
          <div className="relative max-h-full max-w-full">
            <img src={shot} alt="Screenshot celular" className="max-h-[90vh] rounded-xl border border-[var(--border)]" />
            <button
              onClick={() => setShot(null)}
              className="absolute -right-3 -top-3 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}