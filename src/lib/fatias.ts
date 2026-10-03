import { formatInTimeZone } from "date-fns-tz";
import { calcularDRE, fatiar, type Entrada, type Granularidade, type ResultadoDRE, type Periodo } from "@/lib/calculo";

/** DRE por fatia (hora ou dia) a partir de uma entrada já carregada (nenhuma leitura extra do banco). */
export function dreFatiada(entrada: Entrada, periodo: Periodo, gran: Granularidade, tz: string): { fatia: Periodo; rotulo: string; dre: ResultadoDRE }[] {
  return fatiar(periodo, gran, tz).map((fatia) => ({
    fatia,
    rotulo: formatInTimeZone(fatia.inicio, tz, gran === "hora" ? "dd/MM HH'h'" : "dd/MM"),
    dre: calcularDRE({ ...entrada, periodo: fatia }),
  }));
}
