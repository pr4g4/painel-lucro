// Fumaça de ponta a ponta no desktop (13/11: só as telas que restaram): login, inicial, avisos, importar, parâmetros (lançamento manual) e papel "vê".
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/tmp/e2e"; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e))); p.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
await p.goto("http://localhost:3000/login"); await p.waitForLoadState("networkidle");
await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.click("button:has-text('Entrar')"); await p.waitForURL("http://localhost:3000/");
await p.waitForSelector(".hero-ini .hero-v"); console.log("inicial ok; blocos:", await p.locator(".bloco").count());
for (const rota of ["/avisos", "/importar", "/parametros"]) { const r = await p.goto(`http://localhost:3000${rota}`); await p.waitForLoadState("networkidle"); console.log(rota, r.status()); await p.screenshot({ path: `${OUT}${rota}.png`, fullPage: true }); }
// cria lançamento manual em /parametros e confere que aparece
await p.goto("http://localhost:3000/parametros#manuais"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(400);
const fm = p.locator("form:has(input[name=comecaEm])"); await fm.locator("input[name=valor]").fill("37,50"); await fm.locator("input[name=descricao]").fill("TESTE e2e avulso"); await fm.locator("button:has-text('Adicionar')").click();
await p.waitForSelector("text=TESTE e2e avulso"); console.log("manual criado ok");
await p.goto("http://localhost:3000/?p=hoje"); await p.waitForSelector(".hero-ini .hero-v"); console.log("inicial hoje ok");
// Ian só vê
const ip = await b.newPage(); await ip.goto("http://localhost:3000/login"); await ip.waitForLoadState("networkidle");
await ip.fill('input[name=usuario]', "ian"); await ip.fill('input[name=senha]', "ian123"); await ip.click("button:has-text('Entrar')"); await ip.waitForURL("http://localhost:3000/");
await ip.goto("http://localhost:3000/parametros"); console.log("ian vê formulário de adicionar?", await ip.locator("button:has-text('Adicionar')").count());
console.log("erros de página/console:", erros.length ? erros.join(" | ") : "nenhum");
await b.close();
if (erros.length) process.exit(1);
