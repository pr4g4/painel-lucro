import { chromium, devices } from "playwright";
const OUT = "/tmp/claude-0/-home-user-painel-lucro/a6a5e0bb-c97e-5f26-b5a7-06b735ce900b/scratchpad/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const c = await b.newContext({ ...devices["iPhone 13"] }); const p = await c.newPage();
await p.goto("http://localhost:3000/login"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
await p.evaluate(() => { localStorage.setItem("tema", "dark"); });
await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.tap("button:has-text('Entrar')"); await p.waitForURL("http://localhost:3000/");
for (const r of ["dre", "campanhas", "manuais", "venda-manual", "custos", "lancamentos", "produtos", "avisos", "parametros"]) {
  await p.goto(`http://localhost:3000/${r}`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/m-${r}.png`, fullPage: r !== "lancamentos" && r !== "parametros" });
}
await b.close();
