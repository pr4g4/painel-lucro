"use client";
import { useEffect, useState } from "react";

export function BotaoTema() {
  const [tema, setTema] = useState<string>("light");
  useEffect(() => { setTema(document.documentElement.dataset.theme ?? "light"); }, []);
  function alternar() {
    const t = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("tema", t); } catch {}
    setTema(t);
  }
  return <button type="button" onClick={alternar} className="btn" aria-label="Alternar tema" title="Tema claro/escuro">{tema === "dark" ? "☾" : "☀"}</button>;
}
