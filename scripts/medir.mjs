// Mede, por página: TTFB, casca visível (menu), números principais, DOMContentLoaded e load. Uso: node scripts/medir.mjs [rótulo]
import { chromium, devices } from "playwright";
const rotulo = process.argv[2] ?? "";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] });
const c = await b.newContext({ ...devices["iPhone 13"], locale: "pt-BR" }); const p = await c.newPage();
await p.goto("http://localhost:3000/login"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(500);
await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.tap("button:has-text('Entrar')"); await p.waitForURL("http://localhost:3000/");
const paginas = [["/", ".hero-ini .hero-v"], ["/avisos", "h1"], ["/importar", "h1"], ["/parametros", "h1"]];
const so = (process.env.ROTAS ?? "").split(",").filter(Boolean); // ROTAS=/,/dre mede só essas
const linhas = [];
for (const [rota, numeros] of paginas.filter(([r]) => !so.length || so.includes(r))) {
  const t0 = Date.now();
  const resp = await p.goto(`http://localhost:3000${rota}`, { waitUntil: "commit" });
  const ttfb = Date.now() - t0;
  await p.waitForSelector(".topo .marca", { timeout: 60000 }); const casca = Date.now() - t0;
  let num = null; try { await p.waitForSelector(numeros, { timeout: 60000 }); num = Date.now() - t0; } catch {}
  await p.waitForLoadState("domcontentloaded"); const dcl = Date.now() - t0;
  await p.waitForLoadState("load"); const load = Date.now() - t0;
  const erro = await p.locator("h1:has-text('Dado indisponível')").count();
  linhas.push({ rota, status: resp?.status(), ttfb, casca, numeros: num, dcl, load, erro });
}
console.log(`== medição ${rotulo} (ms) ==`);
console.table(linhas);
await b.close();
