import { asc } from "drizzle-orm";
import { schema, executar } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";
import { PARAMETROS_PADRAO } from "@/lib/calculo";
import { fmtDataHora } from "@/lib/formato";
import { paraInputLocal } from "@/lib/periodo-url";
import { novaVigencia, salvarFrente, trocarSenha } from "./acoes";

export const dynamic = "force-dynamic";
const TZ = process.env.APP_TZ ?? "America/Sao_Paulo";
const ROTULO: Record<string, string> = {
  marco_zero: "Marco zero (ISO UTC)", imposto_meta_pct: "Imposto Meta (%)", taxa_zenith_pct: "Taxa Zenith (%)", taxa_zenith_fixa_mxn: "Taxa fixa Zenith (MX$)", taxa_zenith_fixa_brl: "Taxa fixa Zenith (R$)",
  cambio_zenith_pct: "Câmbio Zenith (%)", reserva_zenith_pct: "Reserva Zenith padrão (%)", imposto_lucro_pct: "Imposto sobre lucro (%)", imposto_lucro_base: "Base do imposto (a/b/c)", kie_usd_por_credito: "kie.ai: US$ por crédito", kie_pacote_creditos: "kie.ai: créditos por pacote de recarga",
};

export default async function Parametros() {
  const s = await exigirSessao();
  const edita = s.papel === "edita";
  const [params, frentes, usuarios] = await Promise.all([executar((d) => d.select().from(schema.parametros).orderBy(asc(schema.parametros.chave), asc(schema.parametros.vigenciaInicio)), 15000, "parâmetros"), executar((d) => d.select().from(schema.frentes).orderBy(asc(schema.frentes.ordem)), 15000, "frentes"), executar((d) => d.select({ usuario: schema.usuarios.usuario, nome: schema.usuarios.nome, papel: schema.usuarios.papel }).from(schema.usuarios), 15000, "usuários")]);
  const chaves = [...new Set([...Object.keys(PARAMETROS_PADRAO), "kie_usd_por_credito", ...params.map((p) => p.chave)])];
  const agora = new Date();
  return (
    <>
      <h1 className="font-semibold">Parâmetros com vigência <span className="text-xs text-ink-3 font-normal">mudar hoje não altera período passado; a nova vigência começa na data informada</span></h1>
      <div className="flex flex-col gap-2">
        {chaves.map((chave) => {
          const hist = params.filter((p) => p.chave === chave);
          const vigente = hist.find((p) => !p.vigenciaFim);
          return (
            <details key={chave} className="card p-3 text-sm">
              <summary className="cursor-pointer flex flex-wrap gap-2 items-center"><b>{ROTULO[chave] ?? chave}</b><span className="num">{vigente ? `= ${vigente.valor}` : <span className="text-warn">sem vigência (parâmetro vencido/faltando)</span>}</span><span className="text-xs text-ink-3">{PARAMETROS_PADRAO[chave]?.observacao}</span></summary>
              <table className="tab mt-2"><thead><tr><th>Valor</th><th>Início</th><th>Fim</th><th>Observação</th></tr></thead><tbody>
                {hist.map((p) => <tr key={p.id}><td className="num">{p.valor}</td><td className="num">{fmtDataHora(p.vigenciaInicio, TZ, "dd/MM/yy HH:mm")}</td><td className="num">{p.vigenciaFim ? fmtDataHora(p.vigenciaFim, TZ, "dd/MM/yy HH:mm") : "vigente"}</td><td className="text-xs">{p.observacao}</td></tr>)}
              </tbody></table>
              {edita && <form action={novaVigencia} className="flex flex-wrap gap-2 items-end mt-2"><input type="hidden" name="chave" value={chave} /><input type="hidden" name="tz" value={TZ} />
                <label>Novo valor<br /><input name="valor" required /></label><label>Vale a partir de<br /><input type="datetime-local" name="inicio" required defaultValue={paraInputLocal(agora, TZ)} /></label><label>Observação<br /><input name="observacao" /></label><button className="btn btn-primary">Aplicar nova vigência</button></form>}
            </details>
          );
        })}
      </div>
      <h2 className="font-semibold mt-2">Frentes <span className="text-xs text-ink-3 font-normal">regra = expressão regular sobre o nome da campanha (sem mexer no código)</span></h2>
      <div className="card p-3 text-sm flex flex-col gap-2">
        {frentes.map((f) => <form key={f.id} action={salvarFrente} className="flex flex-wrap gap-2 items-center"><input type="hidden" name="id" value={f.id} /><input name="nome" defaultValue={f.nome} disabled={!edita} /><input name="regraCampanha" defaultValue={f.regraCampanha} className="w-64 font-mono" disabled={!edita} /><label className="flex items-center gap-1"><input type="checkbox" name="ativa" defaultChecked={f.ativa} disabled={!edita} />ativa</label>{edita && <button className="btn">salvar</button>}</form>)}
        {edita && <form action={salvarFrente} className="flex flex-wrap gap-2 items-center"><input name="nome" placeholder="nova frente" required /><input name="regraCampanha" placeholder="regra, ex.: NOVO\s*PRODUTO" className="w-64 font-mono" required /><label className="flex items-center gap-1"><input type="checkbox" name="ativa" defaultChecked />ativa</label><button className="btn btn-primary">cadastrar</button></form>}
      </div>
      <h2 className="font-semibold mt-2">Usuários</h2>
      <div className="card p-3 text-sm flex flex-col gap-2">
        {usuarios.map((u) => <form key={u.usuario} action={trocarSenha} className="flex flex-wrap gap-2 items-center"><span className="w-40">{u.nome} ({u.usuario}) · {u.papel === "edita" ? "edita" : "só vê"}</span>{(edita || u.usuario === s.usuario) && <><input type="hidden" name="usuario" value={u.usuario} /><input type="password" name="nova" placeholder="nova senha" minLength={6} required /><button className="btn">trocar senha</button></>}</form>)}
      </div>
    </>
  );
}
