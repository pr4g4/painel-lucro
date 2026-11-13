import { asc } from "drizzle-orm";
import { schema, executar } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";
import { PARAMETROS_PADRAO } from "@/lib/calculo";
import { fmtDataHora } from "@/lib/formato";
import { paraInputLocal } from "@/lib/periodo-url";
import { novaVigencia, salvarFrente, trocarSenha } from "./acoes";
import { salvarManual, excluirManual, salvarCategoria, excluirCategoria } from "./acoes-manuais";
import { carregarManuaisCache, carregarCategoriasCache } from "@/lib/dados";
import { fmtNum } from "@/lib/formato";
import { FormGravar } from "@/components/form-gravar";
import { FormCreditoOpenAI } from "@/components/creditos-form";
import { eq } from "drizzle-orm";
const FREQ: [string, string][] = [["unica", "única"], ["diaria", "diária"], ["semanal", "semanal"], ["mensal", "mensal"], ["trimestral", "trimestral"], ["semestral", "semestral"], ["anual", "anual"]];

export const dynamic = "force-dynamic";
const TZ = process.env.APP_TZ ?? "America/Sao_Paulo";
const ROTULO: Record<string, string> = {
  marco_zero: "Marco zero (ISO UTC)", imposto_meta_pct: "Imposto Meta (%)", taxa_zenith_pct: "Taxa Zenith (%)", taxa_zenith_fixa_mxn: "Taxa fixa Zenith (MX$)", taxa_zenith_fixa_brl: "Taxa fixa Zenith (R$)",
  cambio_zenith_pct: "Câmbio Zenith (%)", reserva_zenith_pct: "Reserva Zenith padrão (%)", imposto_lucro_pct: "Imposto sobre lucro (%)", imposto_lucro_base: "Base do imposto (a/b/c)", imposto_tiktok_pct: "Imposto TikTok (%)", meta_receita_mes: "Meta do mês: Receita Líquida (R$)", meta_lucro_mes: "Meta do mês: Lucro Líquido (R$)", kie_usd_por_credito: "kie.ai: US$ por crédito", kie_pacote_creditos: "kie.ai: créditos por pacote de recarga", alerta_saldo_horas: "Alerta de saldo: menos de N horas", alerta_saldo_usd: "Alerta de saldo: menos de US$ N", openai_precos_json: "OpenAI: preços por 1M tokens (JSON {modelo: [entrada, cache, saída]})",
};

export default async function Parametros({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = await exigirSessao();
  const edita = s.papel === "edita";
  const [manuais, cats] = await Promise.all([carregarManuaisCache(), carregarCategoriasCache()]);
  const editar = typeof sp.editar === "string" ? (await executar((d) => d.select().from(schema.lancamentosManuais).where(eq(schema.lancamentosManuais.id, Number(sp.editar))), 10000, "lançamento manual"))[0] : undefined;
  const [params, frentes, usuarios] = await Promise.all([executar((d) => d.select().from(schema.parametros).orderBy(asc(schema.parametros.chave), asc(schema.parametros.vigenciaInicio)), 15000, "parâmetros"), executar((d) => d.select().from(schema.frentes).orderBy(asc(schema.frentes.ordem)), 15000, "frentes"), executar((d) => d.select({ usuario: schema.usuarios.usuario, nome: schema.usuarios.nome, papel: schema.usuarios.papel }).from(schema.usuarios), 15000, "usuários")]);
  const chaves = [...new Set([...Object.keys(PARAMETROS_PADRAO), "kie_usd_por_credito", ...params.map((p) => p.chave)])].filter((c) => c !== "marcacao_robo"); // marcações do gráfico de IA não são parâmetros
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
      <h2 id="manuais" className="font-semibold mt-2">Lançamentos manuais <span className="text-xs text-ink-3 font-normal">custos fixos (ZapData, operação), entradas e aportes; entram no lucro da inicial</span></h2>
      {edita && (
        <FormGravar acao={salvarManual} className="card p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm" botao={editar ? "Salvar alteração" : "Adicionar"} extra={editar ? <a href="/parametros#manuais" className="btn">cancelar</a> : undefined}>
          <input type="hidden" name="tz" value={TZ} />
          {editar && <input type="hidden" name="id" value={editar.id} />}
          <label>Tipo<select name="tipo" defaultValue={editar?.tipo ?? "saida"} className="w-full"><option value="saida">Saída (custo)</option><option value="entrada">Entrada</option><option value="aporte">Aporte de sócio (fora do lucro)</option></select></label>
          <label>Moeda<select name="moeda" defaultValue={editar?.moeda ?? "BRL"} className="w-full"><option>BRL</option><option>MXN</option><option>USD</option></select></label>
          <label>Valor<input name="valor" inputMode="decimal" required defaultValue={editar ? Number(editar.valor) : ""} className="w-full" /></label>
          <label>Categoria<select name="categoriaId" defaultValue={editar?.categoriaId ?? ""} className="w-full"><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label className="col-span-2">Descrição<input name="descricao" defaultValue={editar?.descricao ?? ""} className="w-full" /></label>
          <label>Frequência<select name="frequencia" defaultValue={editar?.frequencia ?? "unica"} className="w-full">{FREQ.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
          <label>Começa em<input type="datetime-local" name="comecaEm" required defaultValue={editar ? paraInputLocal(editar.comecaEm, TZ) : paraInputLocal(agora, TZ)} className="w-full" /></label>
          <label>Termina em (opcional)<input type="datetime-local" name="terminaEm" defaultValue={editar?.terminaEm ? paraInputLocal(editar.terminaEm, TZ) : ""} className="w-full" /></label>
          <label>Status<select name="ativo" defaultValue={editar && !editar.ativo ? "pausado" : "ativo"} className="w-full"><option value="ativo">ativo</option><option value="pausado">pausado</option></select></label>
        </FormGravar>
      )}
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Frequência</th><th>Começa</th><th>Status</th><th className="text-right">Valor</th>{edita && <th />}</tr></thead>
          <tbody>
            {manuais.map((m) => (
              <tr key={m.id} className={!m.ativo ? "text-ink-3" : ""}>
                <td>{m.tipo === "entrada" ? <span className="text-pos">entrada</span> : m.tipo === "aporte" ? "aporte" : "saída"}</td><td>{m.descricao}</td><td>{m.categoria}</td>
                <td>{FREQ.find(([v]) => v === m.frequencia)?.[1]}</td><td className="num">{fmtDataHora(m.comecaEm, TZ, "dd/MM/yy HH:mm")}</td><td>{m.ativo ? "ativo" : "pausado"}</td>
                <td className="text-right num">{m.moeda} {fmtNum(m.valor)}</td>
                {edita && <td className="whitespace-nowrap"><a className="btn btn-mini mr-1" href={`/parametros?editar=${m.id}#manuais`}>editar</a><form action={excluirManual} className="inline"><input type="hidden" name="id" value={m.id} /><button className="btn btn-mini">excluir</button></form></td>}
              </tr>
            ))}
            {manuais.length === 0 && <tr><td colSpan={8} className="text-ink-3">Nenhum lançamento manual.</td></tr>}
          </tbody>
        </table>
      </div>
      <details className="card p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Categorias e em qual linha do lucro cada uma entra</summary>
        <div className="mt-2 flex flex-col gap-1">
          {cats.map((c) => (
            <form key={c.id} action={salvarCategoria} className="flex flex-wrap gap-2 items-center">
              <input type="hidden" name="id" value={c.id} />
              <input name="nome" defaultValue={c.nome} disabled={!edita} />
              <select name="linhaDre" defaultValue={c.linhaDre} disabled={!edita}><option value="operacao">Operação</option><option value="zapdata">ZapData</option><option value="ia">IA</option></select>
              {edita && <><button className="btn btn-mini">salvar</button><button className="btn btn-mini" formAction={excluirCategoria}>excluir</button></>}
            </form>
          ))}
          {edita && <form action={salvarCategoria} className="flex flex-wrap gap-2 items-center mt-1"><input name="nome" placeholder="nova categoria" required /><select name="linhaDre" defaultValue="operacao"><option value="operacao">Operação</option><option value="zapdata">ZapData</option><option value="ia">IA</option></select><button className="btn btn-mini">adicionar</button></form>}
        </div>
      </details>
      <h2 id="creditos" className="font-semibold mt-2">Créditos das IAs <span className="text-xs text-ink-3 font-normal">OpenAI não informa saldo pela API: registre aqui a recarga ou o saldo conferido no painel de Billing para zerar o erro do estimado</span></h2>
      <div className="card p-3 text-sm">{edita ? <FormCreditoOpenAI tz={TZ} agoraLocal={paraInputLocal(agora, TZ)} /> : <span className="text-ink-3">só quem edita registra</span>}</div>
      <h2 className="font-semibold mt-2">Usuários</h2>
      <div className="card p-3 text-sm flex flex-col gap-2">
        {usuarios.map((u) => <form key={u.usuario} action={trocarSenha} className="flex flex-wrap gap-2 items-center"><span className="w-40">{u.nome} ({u.usuario}) · {u.papel === "edita" ? "edita" : "só vê"}</span>{(edita || u.usuario === s.usuario) && <><input type="hidden" name="usuario" value={u.usuario} /><input type="password" name="nova" placeholder="nova senha" minLength={6} required /><button className="btn">trocar senha</button></>}</form>)}
      </div>
    </>
  );
}
