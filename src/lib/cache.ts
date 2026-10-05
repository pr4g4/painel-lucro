import { revalidateTag } from "next/cache";
import { esquecerMemoria } from "./memoria";
/** Invalida o cache de dados (Next) e a memória da instância; fora de uma requisição Next (testes, scripts) só a memória. */
export function invalidarDados() {
  esquecerMemoria();
  try { revalidateTag("dados"); } catch { /* sem contexto de requisição */ }
}
