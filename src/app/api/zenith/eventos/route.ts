import { NextResponse, type NextRequest } from "next/server";
import { and, asc, gte, lt } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { db, schema, executar } from "@/db";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";
import { criarVendaDoEvento } from "@/coletores/zenith-aplicar";
import { invalidarDados } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TZ = "America/Sao_Paulo";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/**
 * GET /api/zenith/eventos?dia=AAAA-MM-DD[&criar=ID_DO_EVENTO] — conferência de um dia (horário de Brasília), para quem está logado como editor:
 * todos os eventos que o webhook recebeu (inclusive rejeitados e com erro), o que o painel fez com cada um, e as vendas gravadas no dia.
 * "criar" lança a venda a partir de um evento guardado, sem a mesclagem por valor/hora, sem duplicar (ver criarVendaDoEvento).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const segredoOk = !!process.env.CRON_SECRET && (auth === `Bearer ${process.env.CRON_SECRET}` || req.nextUrl.searchParams.get("segredo") === process.env.CRON_SECRET);
  const s = await getIronSession<Sessao>(req, NextResponse.next(), SESSAO_OPCOES);
  if (!segredoOk && s.papel !== "edita") return NextResponse.json({ erro: "não autorizado: entre como editor" }, { status: 401 });

  const dia = req.nextUrl.searchParams.get("dia") ?? formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ erro: "dia inválido (AAAA-MM-DD)" }, { status: 400 });
  const ini = fromZonedTime(`${dia}T00:00:00`, TZ), fim = new Date(ini.getTime() + 86_400_000);

  let acao = "";
  const criar = req.nextUrl.searchParams.get("criar");
  if (criar) { const r = await criarVendaDoEvento(criar); acao = `${r.ok ? "✔" : "✖"} ${r.resultado}`; invalidarDados(); await (await import("@/lib/resumos")).recalcularResumos().catch(() => null); }

  const [eventos, vendas] = await Promise.all([
    executar((d) => d.select().from(schema.zenithEventos).where(and(gte(schema.zenithEventos.recebidoEm, ini), lt(schema.zenithEventos.recebidoEm, fim))).orderBy(asc(schema.zenithEventos.recebidoEm)), 15000, "eventos do dia"),
    executar((d) => d.select().from(schema.vendas).where(and(gte(schema.vendas.aprovadaEm, ini), lt(schema.vendas.aprovadaEm, fim))).orderBy(asc(schema.vendas.aprovadaEm)), 15000, "vendas do dia"),
  ]);
  const h = (d: Date | null) => (d ? formatInTimeZone(d, TZ, "HH:mm:ss") : "—");
  const dados = (e: typeof eventos[number]) => { const pl = (e.payload ?? {}) as { data?: Record<string, unknown>; corpoBruto?: string }; if (pl.data) return pl.data; try { return (JSON.parse(pl.corpoBruto ?? "") as { data?: Record<string, unknown> }).data ?? {}; } catch { return {}; } };
  const valor = (d: Record<string, unknown>) => { const a = Number(d.amount ?? d.amountCents ?? d.value); return Number.isFinite(a) ? `${String(d.currency ?? "MXN").toUpperCase()} ${(a / 100).toFixed(2)}` : "—"; };
  const nome = (d: Record<string, unknown>) => { for (const o of [d, d.payer, d.customer, d.client, d.sender]) { if (o && typeof o === "object") { const x = o as Record<string, unknown>; const n = x.payerName ?? x.customerName ?? x.senderName ?? x.name ?? x.nombre ?? x.email; if (typeof n === "string" && n) return n; } } return ""; };
  const aprovadas = vendas.filter((v) => v.status === "aprovada");
  const somaMxn = aprovadas.filter((v) => v.moeda === "MXN").reduce((t, v) => t + Number(v.brutoOriginal), 0);
  const rejeitados = eventos.filter((e) => !e.assinaturaOk).length, comErro = eventos.filter((e) => e.assinaturaOk && /^erro/.test(e.resultado ?? "")).length;
  const mescladosPorHeuristica = eventos.filter((e) => /família diferente/.test(e.resultado ?? ""));
  const linhasEv = eventos.map((e) => {
    const d = dados(e); const r = e.resultado ?? "(sem resultado: o webhook caiu antes de aplicar)";
    const podeCriar = e.assinaturaOk && /deposit\.credited|payment\.captured|checkout\.succeeded/.test(e.tipo) && !/criada|aprovada \(era pendente\)|criada manualmente/.test(r);
    const cor = !e.assinaturaOk ? "#b91c1c" : /^erro/.test(r) ? "#b45309" : /família diferente/.test(r) ? "#7c3aed" : "";
    return `<tr style="color:${cor}"><td>${h(e.recebidoEm)}</td><td>${h(e.timestampZenith)}</td><td>${esc(e.tipo)}</td><td class=num>${esc(valor(d))}</td><td>${esc(nome(d))}</td><td style="font-size:12px">${esc(r)}</td><td style="font-size:12px">${esc(e.vendaIdOrigem ?? "")}</td><td>${podeCriar ? `<a href="?dia=${dia}&criar=${encodeURIComponent(e.eventoId)}" onclick="return confirm('Criar uma venda nova a partir deste evento? Só faça isso se a Zenith mostra esta venda e o painel não.')">criar venda</a>` : ""}</td></tr>`;
  }).join("");
  const linhasV = vendas.map((v) => { const pl = (v.payload ?? {}) as { familia?: string; pagador?: string; mesclas?: string[]; ids?: string[] }; return `<tr><td>${h(v.aprovadaEm)}</td><td>${esc(v.status)}</td><td class=num>${esc(v.moeda)} ${Number(v.brutoOriginal).toFixed(2)}</td><td>${esc(pl.pagador ?? "")}</td><td style="font-size:12px">${esc(v.idOrigem)}</td><td style="font-size:12px">${esc(pl.familia ?? "")}${pl.mesclas?.length ? ` + ${esc(pl.mesclas.join(", "))}` : ""}</td><td style="font-size:12px">${esc((pl.ids ?? []).filter((i) => i !== v.idOrigem).join(", "))}</td><td style="font-size:12px">${esc(v.observacao ?? "")}</td></tr>`; }).join("");
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zenith · eventos de ${dia}</title>
<style>body{font:14px system-ui,sans-serif;margin:16px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#555}.num{white-space:nowrap}.box{background:#f3f4f6;padding:10px 12px;border-radius:8px;margin:8px 0}@media(prefers-color-scheme:dark){body{background:#0b1220;color:#e5e7eb}td,th{border-color:#334155}.box{background:#1e293b}a{color:#93c5fd}}</style>
<h1 style="font-size:18px">Zenith · conferência de ${dia} (horário de Brasília)</h1>
<form><label>Dia <input type="date" name="dia" value="${dia}"></label> <button>Ver</button></form>
${acao ? `<div class="box"><b>Ação:</b> ${esc(acao)}</div>` : ""}
<div class="box"><b>Vendas aprovadas no painel:</b> ${aprovadas.length} (MX$ ${somaMxn.toFixed(2)}) · pendentes ${vendas.filter((v) => v.status === "pendente").length} · outras ${vendas.length - aprovadas.length - vendas.filter((v) => v.status === "pendente").length}<br>
<b>Eventos recebidos pelo webhook:</b> ${eventos.length} · rejeitados na assinatura ${rejeitados} · com erro ${comErro} · <span style="color:#7c3aed">mesclados por valor/hora (não somaram): ${mescladosPorHeuristica.length}</span><br>
<span style="font-size:12px">Compare o número de aprovadas e a soma com a tela de vendas da Zenith. Se a Zenith tem uma venda que não está abaixo: (a) se ela aparece na lista de eventos em roxo ("já registrada … família diferente"), clique <b>criar venda</b> nessa linha; (b) se não há evento nenhum no horário dela, o webhook não chegou: importe o CSV de Conciliação do dia em /importar.</span></div>
<h2 style="font-size:15px">Eventos do webhook (${eventos.length})</h2>
<table><tr><th>recebido</th><th>hora Zenith</th><th>tipo</th><th>valor</th><th>pagador</th><th>o que o painel fez</th><th>venda</th><th></th></tr>${linhasEv || "<tr><td colspan=8>nenhum evento recebido neste dia</td></tr>"}</table>
<h2 style="font-size:15px">Vendas gravadas no dia (${vendas.length})</h2>
<table><tr><th>aprovada</th><th>status</th><th>bruto</th><th>pagador</th><th>id</th><th>família</th><th>outros ids</th><th>observação</th></tr>${linhasV || "<tr><td colspan=8>nenhuma venda</td></tr>"}</table>
<p style="font-size:12px;color:#666">Pagador só aparece se a Zenith mandar nome/e-mail no evento. Eventos em vermelho: assinatura rejeitada (401). Laranja: erro ao aplicar (reprocessado sozinho na coleta de câmbio).</p></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export { db };
