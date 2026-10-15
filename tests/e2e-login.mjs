// Teste de ponta a ponta do login num navegador real. Uso: node tests/e2e-login.mjs http://localhost:3077
import { chromium } from "playwright";
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3077";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const falhas = [];
async function caso(nome, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try { await fn(page, ctx); console.log("ok -", nome); }
  catch (e) { falhas.push(nome); console.log("FALHOU -", nome, "\n   ", e.message); }
  finally { await ctx.close(); }
}
async function logar(page, usuario, senha) {
  await page.goto(`${base}/login`);
  await page.fill('input[name="usuario"]', usuario);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
}

await caso("sem sessão redireciona para /login com voltar", async (page) => {
  await page.goto(`${base}/`);
  await page.waitForURL(/\/login\?voltar=%2F/);
});
await caso("senha errada mostra erro e não cria sessão", async (page, ctx) => {
  await logar(page, "erick", "errada");
  await page.locator("p[role=alert]").waitFor();
  assert.match(await page.locator("p[role=alert]").innerText(), /incorretos/);
  assert.equal((await ctx.cookies()).filter((c) => c.name === "sessao").length, 0);
});
await caso("6ª tentativa errada bloqueia por 15 min", async (page) => {
  for (let i = 0; i < 5; i++) { await logar(page, "ian", "errada"); await page.locator("p[role=alert]").waitFor(); }
  await logar(page, "ian", "errada");
  await page.locator("p[role=alert]").waitFor();
  assert.match(await page.locator("p[role=alert]").innerText(), /Muitas tentativas/);
});
await caso("erick entra como quem edita e sai", async (page, ctx) => {
  await logar(page, "erick", process.env.ERICK_SENHA_INICIAL);
  await page.waitForURL(`${base}/`);
  assert.match(await page.locator("header").innerText(), /Erick · edita/);
  const c = (await ctx.cookies()).find((c) => c.name === "sessao");
  assert.ok(c && c.httpOnly && c.sameSite === "Lax", "cookie httpOnly + SameSite");
  await page.click("header button:has-text('Sair')");
  await page.waitForURL(/\/login/);
  await page.goto(`${base}/`);
  await page.waitForURL(/\/login/);
});
await caso("cookie com token inválido não entra", async (page, ctx) => {
  await ctx.addCookies([{ name: "sessao", value: "token-falso", url: base }]);
  await page.goto(`${base}/`);
  await page.waitForURL(/\/login/);
});

await browser.close();
if (falhas.length) { console.error("falharam:", falhas); process.exit(1); }
