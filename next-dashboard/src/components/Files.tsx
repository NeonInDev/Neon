"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { nome: string; pasta: boolean; tamanho?: number; mtime?: number };
type Dir = { dir: string; raiz: boolean; raizes: string[]; pai: string | null; itens: Item[] };
type Editor = { caminho: string; conteudo: string };

function fmtTamanho(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtData(ms?: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function joinDir(base: string, nome: string) {
  return base.endsWith("\\") ? base + nome : base + "\\" + nome;
}

export function Files() {
  const [dir, setDir] = useState<Dir | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async (d: string) => {
    setCarregando(true);
    setErro("");
    try {
      const url = d ? `/api/neon/arquivos?dir=${encodeURIComponent(d)}` : "/api/neon/arquivos";
      const r = await fetch(url);
      const data = await r.json();
      if (data.erro) throw new Error(data.erro);
      setDir(data);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar("");
  }, [carregar]);

  async function abrirEditor(caminho: string) {
    try {
      const r = await fetch(`/api/neon/arquivos/conteudo?path=${encodeURIComponent(caminho)}`);
      const d = await r.json();
      if (d.erro) {
        setErro(d.erro);
        return;
      }
      setEditor({ caminho: d.caminho, conteudo: d.conteudo });
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  }

  async function salvar() {
    if (!editor || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/neon/arquivos/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminho: editor.caminho, conteudo: editor.conteudo }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "Falha ao salvar");
      setEditor(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  const subir = () => {
    if (!dir || dir.raiz) return;
    carregar(dir.pai || "C:\\");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-lg font-bold">Explorador de arquivos</h1>
          <p className="text-xs text-[var(--dim)]">navegue, veja e edite arquivos do PC</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => carregar("C:\\")}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-1.5 text-sm transition-colors hover:text-[var(--accent)]"
          >
            🖥 Meu PC
          </button>
          <button
            onClick={subir}
            disabled={!dir || dir.raiz}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-1.5 text-sm transition-colors disabled:opacity-40 hover:text-[var(--accent)]"
          >
            ⬆ Subir
          </button>
          <button
            onClick={() => carregar(dir?.dir || "")}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-1.5 text-sm transition-colors hover:text-[var(--accent)]"
          >
            ↻
          </button>
        </div>
      </div>

      {erro && (
        <div className="border-b border-[var(--bad)] bg-[var(--accent-dim)] px-6 py-2 text-sm text-[var(--bad)]">
          {erro}
        </div>
      )}

      <div className="border-b border-[var(--border)] px-6 py-2 font-mono text-xs text-[var(--dim)]">
        {dir?.dir || (carregando ? "carregando..." : "")}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {dir?.raiz && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {dir.raizes.map((l) => (
              <button
                key={l}
                onClick={() => carregar(l)}
                className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-3 text-center font-mono text-sm transition-colors hover:text-[var(--accent)]"
              >
                💿 {l}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dir?.itens.map((i) => {
            const caminho = joinDir(dir.dir, i.nome);
            return (
              <button
                key={caminho}
                onClick={() => (i.pasta ? carregar(caminho) : abrirEditor(caminho))}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent)]"
              >
                <span className="text-lg">{i.pasta ? "📁" : "📄"}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{i.nome}</span>
                <span className="shrink-0 text-[11px] text-[var(--dim)]">
                  {fmtTamanho(i.tamanho)} {fmtData(i.mtime)}
                </span>
              </button>
            );
          })}
          {dir && !carregando && dir.itens.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-[var(--dim)]">
              pasta vazia
            </div>
          )}
        </div>
      </div>

      {editor && (
        <div className="flex h-full min-h-0 flex-1 flex-col border-t border-[var(--border)]">
          <div className="flex items-center justify-between px-6 py-3">
            <span className="truncate font-mono text-sm">{editor.caminho}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setEditor(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Fechar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-bold text-black disabled:opacity-50"
              >
                {salvando ? "..." : "Salvar"}
              </button>
            </div>
          </div>
          <textarea
            value={editor.conteudo}
            onChange={(e) => setEditor({ ...editor, conteudo: e.target.value })}
            className="min-h-0 flex-1 resize-none bg-[var(--panel)] p-4 font-mono text-[13px] outline-none"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
