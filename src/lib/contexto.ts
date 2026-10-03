/** Monta tudo que uma página com período precisa: estado do seletor, DRE atual/anterior, coletas, taxa MXN. */
import { formatInTimeZone } from "date-fns-tz";
import { lerPeriodo, paraInputLocal, type Params, type EstadoPeriodo } from "@/lib/periodo-url";
import { marcoZero, carregarParametros, calcularPeriodoComAnterior, ultimasColetas, carregarCambio } from "@/lib/dados";
import { ROTULO_ATALHO } from "@/lib/calculo";
import { getSessao } from "@/lib/auth/sessao";

export async function contextoPeriodo(sp: Params) {
  const params = await carregarParametros();
  const mz = await marcoZero(params);
  const estado = lerPeriodo(sp, mz);
  const [{ atual, anterior, temBaseAnterior }, coletas, cambio, sessao] = await Promise.all([
    calcularPeriodoComAnterior(estado.periodo, { tz: estado.tz, incluirHistorico: estado.incluirHistorico, incluirManuais: estado.incluirManuais }),
    ultimasColetas(), carregarCambio(), getSessao(),
  ]);
  const taxaMxn = cambio("MXNBRL", estado.agora);
  return { estado, atual, anterior, temBaseAnterior, coletas, taxaMxn, params, sessao, propsSeletor: propsSeletor(estado, sessao.papel === "edita") };
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
