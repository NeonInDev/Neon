"use client";

import { useEffect, useRef, useState } from "react";

type Linha = { tipo: "cmd" | "out" | "err"; texto: string };

export function Terminal() {
  const [linhas, setLinhas] = useState<Linha[]>([
    { tipo: "out", texto: "Terminal remoto — PowerShell do PC da Neon. Use com responsabilidade." },
  ]);
  const [cmd, setCmd] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [linhas]);

  async function executar() {
    const comando = cmd.trim();
    if (!comando || ocupado) return;
    setCmd("");
    setLinhas((l) => [...l, { tipo: "cmd", texto: comando }]);
    setOcupado(true);
    try {
      const r = await fetch("/api/neon/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comando }),
      });
      const d = await r.json();
      const novas: Linha[] = [];
      if (d.stdout) novas.push({ tipo: "out", texto: d.stdout });
      if (d.stderr) novas.push({ tipo: "err", texto: d.stderr });
      if (d.erro) novas.push({ tipo: "err", texto: `[erro] ${d.erro}` });
      if (novas.length === 0) novas.push({ tipo: "out", texto: "(sem saida)" });
      setLinhas((l) => [...l.slice(-300), ...novas]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLinhas((l) => [...l.slice(-300), { tipo: "err", texto: `[erro] ${msg}` }]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--border)] px-6 py-4">
        <h1 className="text-lg font-bold">Terminal remoto</h1>
        <p className="text-xs text-[var(--dim)]">PowerShell do PC da Neon</p>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4 font-mono text-[13px]">
        {linhas.map((l, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap py-0.5 ${
              l.tipo === "cmd"
                ? "font-bold text-[var(--accent)]"
                : l.tipo === "err"
                  ? "text-[var(--bad)]"
                  : "text-[var(--text)]"
            }`}
          >
            {l.tipo === "cmd" && <span className="text-[var(--dim)]">&gt; </span>}
            {l.texto}
          </div>
        ))}
        <div ref={fim} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          executar();
        }}
        className="flex gap-2 border-t border-[var(--border)] p-4"
      >
        <span className="flex items-center font-mono text-sm text-[var(--accent)]">&gt;</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="digite um comando..."
          autoFocus
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2.5 font-mono text-sm outline-none placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={ocupado}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-black transition-opacity disabled:opacity-50"
        >
          {ocupado ? "..." : "EXEC"}
        </button>
      </form>
    </div>
  );
}
