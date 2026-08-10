"use client";

import { useCallback, useEffect, useState } from "react";

type Info = {
  cpuNome?: string;
  cpuUso?: number;
  ramUso?: number;
  ramLivre?: number;
  discoUso?: number;
};

type Bateria = { temBateria?: boolean; pct?: number; status?: string };

function Barra({ nome, pct, cor }: { nome: string; pct?: number | null; cor?: string }) {
  const v = pct == null ? 0 : Math.round(pct);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-[var(--dim)]">{nome}</span>
        <span className="font-mono font-semibold">{pct == null ? "--" : `${v}%`}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--panel)]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${v}%`, background: cor || "var(--accent)" }}
        />
      </div>
    </div>
  );
}

function Card({ nome, valor }: { nome: string; valor: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-4">
      <div className="text-xs text-[var(--dim)]">{nome}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold">{valor}</div>
    </div>
  );
}

export function PcPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [bat, setBat] = useState<Bateria | null>(null);
  const [online, setOnline] = useState(false);
  const [vol, setVol] = useState(50);
  const [shot, setShot] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/neon/pc");
      if (!r.ok) throw new Error("status");
      const d = await r.json();
      setInfo(d.info);
      setBat(d.bateria);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 5000);
    return () => clearInterval(t);
  }, [carregar]);

  async function capturar() {
    try {
      const r = await fetch("/api/neon/pc/screenshot", { method: "POST" });
      const d = await r.json();
      if (d.imagem) setShot(d.imagem);
      else alert(d.erro || "Falha na captura");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function notificar() {
    const titulo = prompt("Titulo da notificacao:", "Neon Dashboard");
    if (titulo === null) return;
    const mensagem = prompt("Mensagem:", "");
    if (mensagem === null) return;
    try {
      const r = await fetch("/api/neon/pc/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, mensagem }),
      });
      const d = await r.json();
      alert(d.ok ? "Notificacao enviada" : d.erro || "Falha");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  const corPct = (pct?: number | null) => {
    if (pct == null) return "var(--dim)";
    if (pct > 85) return "var(--bad)";
    if (pct > 60) return "var(--warn)";
    return "var(--accent)";
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Painel do PC</h1>
          <p className="text-xs text-[var(--dim)]">atualiza a cada 5s</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              online ? "bg-[var(--good)]" : "bg-[var(--bad)]"
            }`}
          />
          <span className={online ? "text-[var(--good)]" : "text-[var(--bad)]"}>
            {online ? "SISTEMA ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Barra nome="CPU" pct={info?.cpuUso} cor={corPct(info?.cpuUso)} />
        <Barra nome="RAM" pct={info?.ramUso} cor={corPct(info?.ramUso)} />
        <Barra nome="DISCO" pct={info?.discoUso} cor={corPct(info?.discoUso)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card nome="Processador" valor={info?.cpuNome || "--"} />
        <Card nome="RAM livre" valor={info?.ramLivre != null ? `${info.ramLivre.toFixed(1)} GB` : "--"} />
        <Card
          nome="Bateria"
          valor={
            bat?.temBateria
              ? `${Math.round(bat.pct ?? 0)}% (${bat.status || "?"})`
              : "sem bateria"
          }
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-[var(--dim)]">Volume do sistema</span>
          <span className="font-mono font-semibold">{vol}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={vol}
          onChange={(e) => setVol(Number(e.target.value))}
          onMouseUp={async () => {
            await fetch("/api/neon/pc/volume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nivel: vol }),
            }).catch(() => {});
          }}
          onTouchEnd={async () => {
            await fetch("/api/neon/pc/volume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nivel: vol }),
            }).catch(() => {});
          }}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={capturar}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--accent)]"
        >
          📸 Capturar tela
        </button>
        <button
          onClick={notificar}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--accent)]"
        >
          🔔 Enviar notificacao
        </button>
      </div>

      {shot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setShot(null)}
        >
          <div className="relative max-h-full max-w-full">
            <img src={shot} alt="Screenshot" className="max-h-[90vh] rounded-xl border border-[var(--border)]" />
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
