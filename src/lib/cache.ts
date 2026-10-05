import { revalidateTag } from "next/cache";
/** Invalida o cache de dados; fora de uma requisição Next (testes, scripts) é um no-op. */
export function invalidarDados() {
  try { revalidateTag("dados"); } catch { /* sem contexto de requisição */ }
}
