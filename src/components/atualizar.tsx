"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BotaoAtualizar() {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "rodando" | "ok" | "erro">("idle");
  const [resumo, setResumo] = useState("");
  async function rodar() {
    setEstado("rodando");
    try {
      const r = await fetch("/api/coleta/todas", { method: "POST" });
      setEstado(r.ok ? "ok" : "erro");
      const t = await fetch(`/api/resumo${location.search}`).then((x) => x.text()).catch(() => "");
      setResumo(t);
      router.refresh();
    } catch { setEstado("erro"); }
    setTimeout(() => setEstado("idle"), 3000);
  }
  return (<>
    <button type="button" className="btn" onClick={rodar} disabled={estado === "rodando"}>{estado === "rodando" ? "Coletando…" : estado === "ok" ? "Atualizado ✓" : estado === "erro" ? "Falhou (veja Avisos)" : "Atualizar agora"}</button>
    {resumo && <span className="text-ink num">{resumo}</span>}
  </>);
}
