"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { quem: "eu" | "neon"; texto: string };

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { quem: "neon", texto: "Ola! Sou a Neon. Como posso ajudar?" },
  ]);
  const [entrada, setEntrada] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [voz, setVoz] = useState(true);
  const fim = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function falar(texto: string) {
    if (!voz) return;
    try {
      const r = await fetch("/api/neon/voz/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.slice(0, 500) }),
      });
      if (!r.ok) return;
      const blob = await r.blob();
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = URL.createObjectURL(blob);
      audioRef.current.play().catch(() => {});
    } catch {}
  }

  async function enviar() {
    const t = entrada.trim();
    if (!t || ocupado) return;
    setEntrada("");
    setMsgs((m) => [...m, { quem: "eu", texto: t }, { quem: "neon", texto: "processando..." }]);
    setOcupado(true);
    try {
      const r = await fetch("/api/neon/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: t, usuario: "Dashboard", userId: "hud_web" }),
      });
      const d = await r.json();
      const reply = d.resposta || d.erro || "Sem resposta.";
      setMsgs((m) => [...m.slice(0, -1), { quem: "neon", texto: reply }]);
      falar(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMsgs((m) => [...m.slice(0, -1), { quem: "neon", texto: `Erro de conexao: ${msg}` }]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-lg font-bold">Chat com a Neon</h1>
          <p className="text-xs text-[var(--dim)]">Responde com IA pelo OpenRouter</p>
        </div>
        <button
          onClick={() => setVoz((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
            voz
              ? "border-[var(--border)] bg-[var(--panel2)] text-[var(--text)]"
              : "border-[var(--border)] bg-[var(--panel2)] text-[var(--dim)] opacity-60"
          }`}
        >
          {voz ? "🔊 VOZ ON" : "🔇 VOZ OFF"}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[75%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
              m.quem === "eu"
                ? "self-end bg-[var(--accent)] text-black"
                : "self-start border border-[var(--border)] bg-[var(--panel2)]"
            }`}
          >
            {m.texto}
          </div>
        ))}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
        className="flex gap-2 border-t border-[var(--border)] p-4"
      >
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="Digite algo pra Neon..."
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-2.5 text-sm outline-none placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={ocupado}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-black transition-opacity disabled:opacity-50"
        >
          {ocupado ? "..." : "ENVIAR"}
        </button>
      </form>
    </div>
  );
}
