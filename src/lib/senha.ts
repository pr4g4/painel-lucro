import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

export async function gerarHashSenha(senha: string) {
  return argonHash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verificarSenha(hash: string, senha: string) {
  return argonVerify(hash, senha).catch(() => false);
}
