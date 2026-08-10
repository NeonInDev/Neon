"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Modo = "jarvis" | "ultron";

const ModoContext = createContext<{ modo: Modo; trocar: () => void }>({
  modo: "jarvis",
  trocar: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [modo, setModo] = useState<Modo>("jarvis");

  useEffect(() => {
    fetch("/api/neon/modo")
      .then((r) => r.json())
      .then((d) => {
        if (d.modo === "ultron" || d.modo === "jarvis") setModo(d.modo);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = modo;
  }, [modo]);

  const trocar = useCallback(async () => {
    const novo: Modo = modo === "ultron" ? "jarvis" : "ultron";
    setModo(novo);
    try {
      const r = await fetch("/api/neon/modo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: novo }),
      });
      const d = await r.json();
      if (d.modo === "ultron" || d.modo === "jarvis") setModo(d.modo);
    } catch {}
  }, [modo]);

  return <ModoContext.Provider value={{ modo, trocar }}>{children}</ModoContext.Provider>;
}

export const useModo = () => useContext(ModoContext);
