/** Monta tudo que uma página com período precisa com UMA leitura do banco: estado do seletor, DRE atual/anterior, coletas, taxa MXN. */
import { formatInTimeZone } from "date-fns-tz";
import { lerPeriodo, paraInputLocal, type Params, type EstadoPeriodo } from "@/lib/periodo-url";
import { montarEntradaAmpla, ultimasColetas, type EstadoColeta } from "@/lib/dados";
import { calcularDRE, periodoAnterior, resolverAtalho, ROTULO_ATALHO, parametroVigente, numeroVigente, type Periodo, type Entrada, type Parametro } from "@/lib/calculo";
import { getSessao } from "@/lib/auth/sessao";

export async function contextoPeriodo(sp: Params) {
  const problemas: string[] = [];
  const sessao = await getSessao();
  // 1ª passada: marco zero sem banco (padrão), só para decidir a janela ampla
  let estado = lerPeriodo(sp, new Date("2026-10-03T03:00:00Z"));
  const hojeP = resolverAtalho("hoje", estado.agora, estado.marcoZero, estado.tz).periodo;
  const hojeAnt = periodoAnterior(hojeP, estado.tz);
  const inicioAmplo = new Date(Math.min(estado.periodo.inicio.getTime(), estado.anterior.inicio.getTime(), hojeAnt.inicio.getTime()));
  const janela: Periodo = { inicio: inicioAmplo, fim: new Date(Math.max(estado.periodo.fim.getTime(), estado.agora.getTime())) };
  const op = { tz: estado.tz, incluirHistorico: estado.incluirHistorico, incluirManuais: estado.incluirManuais };
  const [entrada, coletas] = await Promise.all([
    montarEntradaAmpla(janela, op, problemas),
    ultimasColetas().catch((e) => { problemas.push(`coletas: dado indisponível (${e instanceof Error ? e.message : e})`); return new Map<string, EstadoColeta>(); }),
  ]);
  // 2ª passada: marco zero real (vem dos parâmetros) e recorte definitivo
  estado = lerPeriodo(sp, entrada.opcoes.marcoZero);
  const calc = (p: Periodo) => calcularDRE({ ...entrada, periodo: p, opcoes: { ...entrada.opcoes, ...op } });
  const funil = (p: Periodo) => funilDoPeriodo(entrada, p, op.incluirHistorico);
  const atual = calc(estado.periodo);
  const anterior = calc(estado.anterior);
  const temBaseAnterior = temDados(entrada, estado.anterior, op.incluirHistorico);
  const taxaMxn = entrada.opcoes.cambio("MXNBRL", estado.agora);
  return { estado, atual, anterior, temBaseAnterior, coletas, taxaMxn, funil, funilAtual: funil(estado.periodo), funilAnterior: funil(estado.anterior), params: entrada.parametros, sessao, entrada, calc, temDados: (p: Periodo) => temDados(entrada, p, op.incluirHistorico), problemas, propsSeletor: propsSeletor(estado, sessao.papel === "edita") };
}

/** Há base de comparação? Só com dado que ENTRA no cálculo: sem "incluir histórico", nada antes do marco zero conta. */
function temDados(e: Entrada, p: Periodo, incluirHistorico: boolean): boolean {
  if (!incluirHistorico && p.fim.getTime() <= e.opcoes.marcoZero.getTime()) return false;
  const dentro = (d: Date | null) => !!d && d >= p.inicio && d < p.fim;
  const conta = (h: boolean) => incluirHistorico || !h;
  return e.vendas.some((v) => conta(v.historico) && dentro(v.aprovadaEm)) || e.lancamentos.some((l) => conta(l.historico) && dentro(l.instante))
    || e.manuais.some((m) => m.ativo && m.comecaEm < p.fim && (incluirHistorico || m.comecaEm.getTime() >= e.opcoes.marcoZero.getTime() || m.frequencia !== "unica"));
}

export function rotuloPeriodo(e: EstadoPeriodo): string {
  const f = (d: Date) => formatInTimeZone(d, e.tz, "dd/MM HH:mm");
  const nome = e.atalho === "personalizado" ? "Personalizado" : ROTULO_ATALHO[e.atalho];
  return `${nome}: ${f(e.periodo.inicio)} – ${f(e.periodo.fim)}`;
}

export function propsSeletor(e: EstadoPeriodo, podeSalvar: boolean) {
  const f = (d: Date) => formatInTimeZone(d, e.tz, "dd/MM HH:mm");
  return {
    atalho: e.atalho, deLocal: paraInputLocal(e.periodo.inicio, e.tz), ateLocal: paraInputLocal(e.periodo.fim, e.tz), tz: e.tz,
    incluirHistorico: e.incluirHistorico, incluirManuais: e.incluirManuais, moeda: e.moeda, rotuloPeriodo: rotuloPeriodo(e),
    rotuloAnterior: `${f(e.anterior.inicio)} – ${f(e.anterior.fim)}`, gran: e.gran, granManual: e.granManual, podeSalvar,
  };
}

export const _tipos = { parametroVigente, numeroVigente } as { parametroVigente: typeof parametroVigente; numeroVigente: typeof numeroVigente; _p?: Parametro };

export type Funil = { geradas: number; pendentesQtd: number; pendentesValor: number; aprovadas: number; conversao: number | null };
/**
 * Funil de vendas do período (13/11), na definição da "Taxa de aprovação" da Zenith: geradas = vendas CRIADAS no período,
 * qualquer status (aprovada, pendente, reembolsada, cancelada pela Zenith); aprovadas = aprovadas no período (o mesmo "Nº de vendas");
 * conversão = aprovadas ÷ geradas. Pendentes = criadas no período e ainda pendentes (quantidade e líquido). Duplicadas anuladas não contam.
 */
export function funilDoPeriodo(e: Entrada, p: Periodo, incluirHistorico: boolean): Funil {
  const conta = (h: boolean) => incluirHistorico || !h;
  const dentroP = (d: Date | null) => !!d && d >= p.inicio && d < p.fim;
  const q = (v: { quantidade?: number }) => v.quantidade ?? 1;
  const criadas = e.vendas.filter((v) => conta(v.historico) && dentroP(v.criadaEm));
  const geradas = criadas.reduce((s, v) => s + q(v), 0);
  const pend = criadas.filter((v) => v.status === "pendente");
  const aprovadas = e.vendas.filter((v) => conta(v.historico) && dentroP(v.aprovadaEm) && v.status !== "pendente" && v.status !== "cancelada").reduce((s, v) => s + q(v), 0);
  return { geradas, pendentesQtd: pend.reduce((s, v) => s + q(v), 0), pendentesValor: pend.reduce((s, v) => s + v.liquidoBrl, 0), aprovadas, conversao: geradas > 0 ? aprovadas / geradas : null };
}
