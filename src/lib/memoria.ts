/**
 * Memória da instância com "stale-while-revalidate" e "stale-if-error": guarda o ÚLTIMO VALOR BOM de cada chave.
 * - fresco (dentro do TTL) → devolve sem consultar
 * - vencido mas com valor bom → devolve o valor antigo NA HORA e atualiza em segundo plano (swr: true)
 *   ou espera a atualização (swr: false); se a atualização falhar ou vier vazia quando vazio não é aceitável, mantém o bom
 * - sem valor bom → consulta e espera; erro propaga (nunca devolve vazio no lugar de dado)
 * - chamadas simultâneas da mesma chave compartilham uma única consulta (dedup em voo)
 * Invalidação: esquecerMemoria() nas gravações (mesma instância); outras instâncias vencem pelo TTL.
 */
type Item = { valor: unknown; em: number };
const g = globalThis as unknown as { __painelMemoria?: Map<string, Item>; __painelEmVoo?: Map<string, Promise<unknown>> };
const mapa = () => (g.__painelMemoria ??= new Map<string, Item>());
const emVoo = () => (g.__painelEmVoo ??= new Map<string, Promise<unknown>>());
const MAX_CHAVES = 120;

export type OpcoesLembrar = { ttlMs: number; vazioEhErro?: boolean; rotulo?: string; swr?: boolean };

async function carregarGuardando<T>(chave: string, carregar: () => Promise<T>, op: OpcoesLembrar, antigo: Item | undefined): Promise<T> {
  const m = mapa();
  const pendente = emVoo().get(chave) as Promise<T> | undefined;
  if (pendente) return pendente;
  const p = (async () => {
    try {
      const v = await carregar();
      if (op.vazioEhErro && Array.isArray(v) && v.length === 0) throw new Error(`${op.rotulo ?? chave}: consulta voltou vazia`);
      if (m.size >= MAX_CHAVES && !m.has(chave)) m.delete(m.keys().next().value as string);
      m.set(chave, { valor: v, em: Date.now() });
      return v;
    } catch (e) {
      if (antigo) {
        console.warn(`[memória] ${op.rotulo ?? chave}: falhou, mantendo o último valor bom de ${new Date(antigo.em).toISOString()} —`, e instanceof Error ? e.message : e);
        return antigo.valor as T;
      }
      throw e;
    } finally { emVoo().delete(chave); }
  })();
  emVoo().set(chave, p);
  return p;
}

export async function lembrar<T>(chave: string, carregar: () => Promise<T>, op: OpcoesLembrar): Promise<T> {
  const antigo = mapa().get(chave);
  const agora = Date.now();
  if (antigo && agora - antigo.em < op.ttlMs) return antigo.valor as T;
  if (antigo && op.swr) {
    // devolve o antigo já e atualiza por trás (uma vez só, mesmo com várias páginas pedindo)
    if (!emVoo().has(chave)) void carregarGuardando(chave, carregar, op, antigo).catch(() => {});
    return antigo.valor as T;
  }
  return carregarGuardando(chave, carregar, op, antigo);
}

export function esquecerMemoria(prefixo?: string) {
  const m = mapa();
  for (const k of [...m.keys()]) if (!prefixo || k.startsWith(prefixo)) m.delete(k);
}

export function estadoMemoria() {
  return [...mapa().entries()].map(([chave, i]) => ({ chave, em: new Date(i.em).toISOString(), itens: Array.isArray(i.valor) ? i.valor.length : null }));
}
