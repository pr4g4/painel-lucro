import { formatInTimeZone } from "date-fns-tz";
import { calcularDRE, fatiar, type Entrada, type Granularidade, type ResultadoDRE, type Periodo } from "@/lib/calculo";
import { montarEntrada, type OpcoesConsulta } from "@/lib/dados";

/** DRE por fatia (hora ou dia) reutilizando uma única leitura do banco. */
export async function dreFatiada(periodo: Periodo, gran: Granularidade, op: OpcoesConsulta): Promise<{ fatia: Periodo; rotulo: string; dre: ResultadoDRE }[]> {
  const entrada: Entrada = await montarEntrada(periodo, op);
  return fatiar(periodo, gran, op.tz).map((fatia) => ({
    fatia,
    rotulo: formatInTimeZone(fatia.inicio, op.tz, gran === "hora" ? "dd/MM HH'h'" : "dd/MM"),
    dre: calcularDRE({ ...entrada, periodo: fatia }),
  }));
}
