import { chromium, devices } from "playwright";
const OUT = "/tmp/claude-0/-home-user-painel-lucro/a6a5e0bb-c97e-5f26-b5a7-06b735ce900b/scratchpad/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const [nome, opts, tema] of [["desk-dark", { viewport: { width: 1360, height: 900 } }, "dark"], ["mob-dark", devices["iPhone 13"], "dark"], ["mob-light", devices["iPhone 13"], "light"]]) {
  const c = await b.newContext(opts); const p = await c.newPage();
  await p.goto("http://localhost:3000/login"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
  await p.evaluate((t) => { localStorage.setItem("tema", t); document.documentElement.dataset.theme = t; }, tema);
  await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.click("button:has-text('Entrar')"); await p.waitForURL("http://localhost:3000/"); await p.waitForSelector("text=Lucro líquido"); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${nome}-painel.png`, fullPage: true });
  await p.goto("http://localhost:3000/resumo"); await p.waitForSelector("text=Lucro líquido hoje"); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${nome}-resumo.png`, fullPage: true });
  if (nome === "desk-dark") { await p.goto("http://localhost:3000/dre"); await p.waitForSelector("text=DRE do período"); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${nome}-dre.png`, fullPage: false }); }
  if (nome === "mob-dark") { await p.click("button[aria-label='Abrir menu']"); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${nome}-menu.png` }); }
  await c.close();
}
await b.close();
