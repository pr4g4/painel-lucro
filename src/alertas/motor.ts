/**
 * Motor de alertas: avalia as condições, guarda o estado em `alertas` e envia pelo provedor configurado.
 * Regras: 1 envio por chave a cada `alerta_repeticao_h` horas enquanto aberto; mensagem "resolvido" ao normalizar.
 * Condições: saldo kie/OpenAI baixo; fonte com 3 coletas seguidas falhando; webhook da Zenith rejeitado; agendador parado > 30 min.
 */
import { eq, desc } from "drizzle-orm";
import { db, schema, executar } from "@/db";
import { alertaSaldo, numeroVigente } from "@/lib/calculo";
import { carregarCreditos } from "@/coletores/creditos";
import { ultimasColetas, avisosAbertos, carregarParametros } from "@/lib/dados";
import { provedorAtual, type Provedor } from "./provedores";

export type Condicao = { chave: string; tipo: string; ativa: boolean; mensagem: string };

export async function condicoesAtuais(agora = new Date()): Promise<Condicao[]> {
  const out: Condicao[] = [];
  const [cred, coletas, avisos] = await Promise.all([carregarCreditos(agora).catch(() => null), ultimasColetas().catch(() => new Map()), avisosAbertos().catch(() => [])]);
  if (cred) {
    for (const s of [cred.kie, cred.openai]) {
      const m = alertaSaldo(s, cred.limites);
      out.push({ chave: `saldo:${s.fonte}`, tipo: "saldo_baixo", ativa: !!m, mensagem: `Saldo ${s.fonte === "kie" ? "kie.ai" : "OpenAI"}: ${m ?? "ok"}` });
    }
  }
  for (const f of ["meta", "zenith", "openai", "kie", "cambio"]) {
    const c = coletas.get(f);
    const ativa = !!c && !c.naoConfigurada && c.falhasSeguidas >= 3;
    out.push({ chave: `coleta:${f}`, tipo: "coleta_falhando", ativa, mensagem: `Fonte ${f}: ${ativa ? `${c!.falhasSeguidas} coletas seguidas falhando (${(c!.erro ?? "").slice(0, 120)})` : "voltou a coletar"}` });
  }
  const rej = avisos.filter((a) => a.tipo === "webhook_rejeitado");
  out.push({ chave: "webhook:zenith", tipo: "webhook_rejeitado", ativa: rej.length > 0, mensagem: rej.length ? `Webhook da Zenith rejeitado: ${rej[0].mensagem.slice(0, 140)}` : "Webhook da Zenith voltou a ser aceito" });
  const cambio = coletas.get("cambio");
  const parado = !cambio || agora.getTime() - cambio.ultima.getTime() > 30 * 60_000;
  out.push({ chave: "agendador", tipo: "agendador_parado", ativa: parado, mensagem: parado ? `Agendador parado: última coleta ${cambio ? `há ${Math.round((agora.getTime() - cambio.ultima.getTime()) / 60_000)} min` : "nunca rodou"}` : "Agendador voltou a rodar" });
  return out;
}

export type ResultadoAlertas = { configurado: boolean; provedor: string; faltando: string[]; enviados: string[]; erros: string[]; tabelaAusente?: boolean };

export async function processarAlertas(agora = new Date(), provedor: Provedor = provedorAtual(), condicoes?: Condicao[]): Promise<ResultadoAlertas> {
  const res: ResultadoAlertas = { configurado: provedor.configurado(), provedor: provedor.nome, faltando: provedor.faltando(), enviados: [], erros: [] };
  let params: Awaited<ReturnType<typeof carregarParametros>> = []; try { params = await carregarParametros(); } catch { params = []; }
  const repeticaoMs = numeroVigente(params, "alerta_repeticao_h", agora, 3) * 3_600_000;
  const conds = condicoes ?? await condicoesAtuais(agora);
  let existentes: typeof schema.alertas.$inferSelect[];
  try { existentes = await executar((d) => d.select().from(schema.alertas)); }
  catch (e) { res.tabelaAusente = true; res.erros.push(`tabela alertas ausente (rode drizzle/0003_alertas.sql): ${e instanceof Error ? e.message.slice(0, 80) : e}`); return res; }
  const porChave = new Map(existentes.map((a) => [a.chave, a]));
  const enviar = async (chave: string, texto: string, patch: Partial<typeof schema.alertas.$inferInsert>) => {
    if (!res.configurado) { await db.update(schema.alertas).set(patch).where(eq(schema.alertas.chave, chave)); return; }
    try { await provedor.enviar(texto); res.enviados.push(texto); await db.update(schema.alertas).set({ ...patch, ultimoEnvioEm: agora, ultimoErro: null }).where(eq(schema.alertas.chave, chave)); }
    catch (e) { const msg = e instanceof Error ? e.message : String(e); res.erros.push(`${chave}: ${msg}`); await db.update(schema.alertas).set({ ...patch, ultimoErro: msg }).where(eq(schema.alertas.chave, chave)); }
  };
  for (const c of conds) {
    const a = porChave.get(c.chave);
    if (c.ativa) {
      if (!a) {
        await db.insert(schema.alertas).values({ chave: c.chave, tipo: c.tipo, estado: "aberto", mensagem: c.mensagem, abertoEm: agora, envios: 0 }).onConflictDoNothing();
        await enviar(c.chave, `⚠️ Painel de Lucro\n${c.mensagem}`, { envios: 1, mensagem: c.mensagem });
      } else if (a.estado === "resolvido") {
        await db.update(schema.alertas).set({ estado: "aberto", abertoEm: agora, resolvidoEm: null, mensagem: c.mensagem }).where(eq(schema.alertas.chave, c.chave));
        await enviar(c.chave, `⚠️ Painel de Lucro\n${c.mensagem}`, { envios: a.envios + 1 });
      } else if (!a.ultimoEnvioEm || agora.getTime() - a.ultimoEnvioEm.getTime() >= repeticaoMs) {
        await enviar(c.chave, `⚠️ Painel de Lucro (ainda)\n${c.mensagem}`, { envios: a.envios + 1, mensagem: c.mensagem });
      }
    } else if (a && a.estado === "aberto") {
      await db.update(schema.alertas).set({ estado: "resolvido", resolvidoEm: agora }).where(eq(schema.alertas.chave, c.chave));
      await enviar(c.chave, `✅ Painel de Lucro\nResolvido: ${c.mensagem}`, { envios: a.envios + 1 });
    }
  }
  return res;
}

export async function listarAlertas() {
  try { return await executar((d) => d.select().from(schema.alertas).orderBy(desc(schema.alertas.abertoEm)).limit(30)); } catch { return null; }
}
