import { coletarCambio, ptaxCliente } from "./cambio";
import { coletarMeta, metaClienteReal } from "./meta";
import { coletarOpenAI, openaiClienteReal } from "./openai";
import { coletarKie, kieClienteReal } from "./kie";
import { abrirAviso, type ResultadoColeta } from "./base";
import { db, schema } from "@/db";

export const FONTES = ["cambio", "meta", "openai", "kie", "zenith"] as const;
export type Fonte = (typeof FONTES)[number];

export const ROTULO_FONTE: Record<string, string> = {
  cambio: "Câmbio (PTAX)", meta: "Meta Ads", openai: "OpenAI", kie: "kie.ai", zenith: "Zenith", manual: "Manual", zapdata: "ZapData",
};

/** Roda um coletor real com as variáveis do servidor. Fonte sem chave vira aviso "não configurada", não erro. */
export async function coletar(fonte: Fonte): Promise<ResultadoColeta> {
  switch (fonte) {
    case "cambio": return coletarCambio(ptaxCliente);
    case "meta": {
      const token = process.env.META_TOKEN;
      const contas = [process.env.META_ACT_00, process.env.META_ACT_01].filter(Boolean) as string[];
      if (!token || !contas.length) return naoConfigurada("meta", "META_TOKEN / META_ACT_00 / META_ACT_01");
      return coletarMeta(metaClienteReal(token), contas);
    }
    case "openai": {
      const k = process.env.OPENAI_ADMIN_KEY;
      if (!k) return naoConfigurada("openai", "OPENAI_ADMIN_KEY");
      return coletarOpenAI(openaiClienteReal(k), process.env.OPENAI_PROJECT_ID || undefined);
    }
    case "kie": {
      const k = process.env.KIE_API_KEY;
      if (!k) return naoConfigurada("kie", "KIE_API_KEY");
      return coletarKie(kieClienteReal(k));
    }
    case "zenith":
      return { fonte: "zenith", ok: true, registros: 0, detalhe: { nota: "Zenith entra por webhook (/api/zenith/webhook) ou importação CSV; sem coleta ativa." } };
  }
}

async function naoConfigurada(fonte: string, vars: string): Promise<ResultadoColeta> {
  await abrirAviso("fonte_nao_configurada", fonte, `Fonte ${fonte} sem chave: defina ${vars} no host.`);
  // registra a tentativa para o carimbo "tentou às HH:MM" (ok = false, erro explica)
  await db.insert(schema.coletas).values({ fonte, terminadaEm: new Date(), ok: false, registros: 0, erro: `não configurada (${vars})` }).catch(() => {});
  return { fonte, ok: false, registros: 0, erro: `não configurada (${vars})` };
}

/** Ordem importa: câmbio antes das fontes em USD. */
export async function coletarTudo(): Promise<ResultadoColeta[]> {
  const out: ResultadoColeta[] = [];
  for (const f of FONTES) out.push(await coletar(f));
  return out;
}
