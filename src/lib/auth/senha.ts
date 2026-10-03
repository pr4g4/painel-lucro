import { hash, verify } from "@node-rs/argon2";

// argon2id com parâmetros moderados (serverless): 19 MiB, 2 iterações, paralelismo 1
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export async function gerarHash(senha: string): Promise<string> {
  if (senha.length < 6) throw new Error("Senha precisa ter pelo menos 6 caracteres");
  return hash(senha, OPTS);
}

export async function conferirSenha(senha: string, senhaHash: string): Promise<boolean> {
  try { return await verify(senhaHash, senha); } catch { return false; }
}
