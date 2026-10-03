import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";
import { ultimasColetas } from "@/lib/dados";
import { fmtDataHora } from "@/lib/formato";
import { ROTULO_FONTE } from "@/coletores";
import { resolverAviso } from "./acoes";

export const dynamic = "force-dynamic";
const TZ = process.env.APP_TZ ?? "America/Sao_Paulo";

export default async function Avisos() {
  const s = await exigirSessao();
  const [avisos, coletas] = await Promise.all([db.select().from(schema.avisos).orderBy(desc(schema.avisos.criadoEm)).limit(200), ultimasColetas()]);
  const abertos = avisos.filter((a) => !a.resolvidoEm);
  const agora = Date.now();
  return (
    <>
      <h1 className="font-semibold">Avisos <span className="text-xs text-ink-3 font-normal">{abertos.length} aberto(s)</span></h1>
      <div className="card p-3 text-sm">
        <h2 className="font-semibold mb-2">Estado das fontes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {["meta", "zenith", "cambio", "openai", "kie"].map((f) => {
            const c = coletas.get(f);
            const atras = !c?.ultimaOk || agora - c.ultimaOk.getTime() > 30 * 60_000;
            return <div key={f} className={`card p-2 ${atras && f !== "zenith" ? "border-warn" : ""}`}><b>{ROTULO_FONTE[f]}</b><div className="text-xs text-ink-2">última coleta ok: {c?.ultimaOk ? fmtDataHora(c.ultimaOk, TZ, "dd/MM HH:mm") : "nunca"}{c?.erro && <div className="text-neg">erro: {c.erro}</div>}{c?.falhasSeguidas ? <div className="text-warn">{c.falhasSeguidas} falha(s) seguida(s)</div> : null}</div></div>;
          })}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Quando</th><th>Tipo</th><th>Fonte</th><th>Mensagem</th><th>Situação</th>{s.papel === "edita" && <th></th>}</tr></thead>
          <tbody>
            {avisos.map((a) => (
              <tr key={a.id} className={a.resolvidoEm ? "text-ink-3" : ""}>
                <td className="num whitespace-nowrap">{fmtDataHora(a.criadoEm, TZ, "dd/MM HH:mm")}</td><td className="text-xs">{a.tipo}</td><td>{a.fonte ? ROTULO_FONTE[a.fonte] ?? a.fonte : "—"}</td><td>{a.mensagem}</td>
                <td className="text-xs">{a.resolvidoEm ? `resolvido ${fmtDataHora(a.resolvidoEm, TZ, "dd/MM HH:mm")}` : <span className="text-warn">aberto</span>}</td>
                {s.papel === "edita" && <td>{!a.resolvidoEm && <form action={resolverAviso}><input type="hidden" name="id" value={a.id} /><button className="btn">resolver</button></form>}</td>}
              </tr>
            ))}
            {avisos.length === 0 && <tr><td colSpan={6} className="text-ink-3">Nenhum aviso.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
