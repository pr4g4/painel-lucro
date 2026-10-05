import { describe, expect, it, vi } from "vitest";
import { lembrar, esquecerMemoria } from "../src/lib/memoria";

describe("memória da instância (stale-if-error)", () => {
  it("guarda o último valor bom e devolve-o quando a consulta falha; nunca devolve vazio no lugar de dado", async () => {
    esquecerMemoria();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await lembrar("t:params", async () => [1, 2], { ttlMs: 0, vazioEhErro: true })).toEqual([1, 2]);
    expect(await lembrar("t:params", async () => { throw new Error("statement timeout"); }, { ttlMs: 0, vazioEhErro: true })).toEqual([1, 2]);
    expect(await lembrar("t:params", async () => [], { ttlMs: 0, vazioEhErro: true })).toEqual([1, 2]); // vazio = erro → mantém o bom
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it("sem valor bom, propaga o erro", async () => {
    esquecerMemoria();
    await expect(lembrar("t:novo", async () => { throw new Error("falhou"); }, { ttlMs: 0 })).rejects.toThrow("falhou");
    await expect(lembrar("t:vazio", async () => [], { ttlMs: 0, vazioEhErro: true })).rejects.toThrow(/vazia/);
  });
  it("dentro do TTL não consulta de novo; esquecer força nova consulta", async () => {
    esquecerMemoria();
    const fn = vi.fn(async () => ["a"]);
    await lembrar("t:ttl", fn, { ttlMs: 60_000 }); await lembrar("t:ttl", fn, { ttlMs: 60_000 });
    expect(fn).toHaveBeenCalledTimes(1);
    esquecerMemoria("t:"); await lembrar("t:ttl", fn, { ttlMs: 60_000 });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
