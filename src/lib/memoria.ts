/**
 * Memória da instância com "stale-if-error": guarda o ÚLTIMO VALOR BOM de cada chave.
 * - fresco (dentro do TTL) → devolve sem consultar
 * - vencido → consulta; se a consulta falhar ou vier vazia quando vazio não é aceitável, devolve o último bom e registra no log
 * - sem valor bom → propaga o erro (nunca devolve vazio no lugar de dado)
 * Invalidação: esquecerMemoria() nas gravações (mesma instância); outras instâncias vencem pelo TTL.
 */
type Item = { valor: unknown; em: number };
const g = globalThis as unknown as { __painelMemoria?: Map<string, Item> };
const mapa = () => (g.__painelMemoria ??= new Map<string, Item>());
const MAX_CHAVES = 60;

export async function lembrar<T>(chave: string, carregar: () => Promise<T>, op: { ttlMs: number; vazioEhErro?: boolean; rotulo?: string }): Promise<T> {
  const m = mapa();
  const antigo = m.get(chave);
  const agora = Date.now();
  if (antigo && agora - antigo.em < op.ttlMs) return antigo.valor as T;
  try {
    const v = await carregar();
    if (op.vazioEhErro && Array.isArray(v) && v.length === 0) throw new Error(`${op.rotulo ?? chave}: consulta voltou vazia`);
    if (m.size >= MAX_CHAVES && !m.has(chave)) m.delete(m.keys().next().value as string);
    m.set(chave, { valor: v, em: agora });
    return v;
  } catch (e) {
    if (antigo) {
      console.warn(`[memória] ${op.rotulo ?? chave}: falhou, mantendo o último valor bom de ${new Date(antigo.em).toISOString()} —`, e instanceof Error ? e.message : e);
      return antigo.valor as T;
    }
    throw e;
  }
}

export function esquecerMemoria(prefixo?: string) {
  const m = mapa();
  for (const k of [...m.keys()]) if (!prefixo || k.startsWith(prefixo)) m.delete(k);
}

export function estadoMemoria() {
  return [...mapa().entries()].map(([chave, i]) => ({ chave, em: new Date(i.em).toISOString(), itens: Array.isArray(i.valor) ? i.valor.length : null }));
}
