// Fumaça no celular (iPhone 13): barra inferior com 4 itens, sem rolagem horizontal, nada cobrindo botões.
import { chromium, devices } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] });
const c = await b.newContext({ ...devices["iPhone 13"], locale: "pt-BR" }); const p = await c.newPage();
const erros = []; p.on("pageerror", (e) => erros.push(String(e))); p.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
let falhas = 0; const chk = (nome, ok) => { console.log(ok ? "OK " : "FALHA", nome); if (!ok) falhas++; };
await p.goto("http://localhost:3000/login"); await p.waitForLoadState("networkidle");
await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.tap("button:has-text('Entrar')"); await p.waitForURL("http://localhost:3000/");
await p.waitForSelector(".hero-ini .hero-v");
chk("barra inferior com 4 itens", (await p.locator(".barra-inferior a").count()) === 4);
for (const [rotulo, rota] of [["Avisos", "/avisos"], ["Importar", "/importar"], ["Parâmetros", "/parametros"], ["Início", "/"]]) {
  await p.locator(`.barra-inferior a:has-text("${rotulo}")`).tap(); await p.waitForTimeout(900); chk(`barra → ${rotulo}`, new URL(p.url()).pathname === rota);
}
for (const rota of ["/", "/avisos", "/importar", "/parametros"]) {
  await p.goto(`http://localhost:3000${rota}`); await p.waitForLoadState("networkidle");
  const semRolagem = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  chk(`página ${rota}: sem rolagem horizontal`, semRolagem);
  const cobertos = await p.evaluate(() => { let n = 0; for (const el of document.querySelectorAll("main button, main a.btn")) { const r = el.getBoundingClientRect(); if (r.width === 0) continue; const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (topo && !el.contains(topo) && !topo.contains(el)) n++; } return n; });
  chk(`página ${rota}: nada cobrindo botões`, cobertos === 0);
}
console.log("erros de página/console:", erros.length ? erros.join(" | ") : "nenhum");
await b.close();
console.log(falhas === 0 && erros.length === 0 ? "TUDO OK" : `${falhas} falha(s)`);
if (falhas || erros.length) process.exit(1);
