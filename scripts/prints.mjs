// Gera os prints de documentação em docs/prints (desktop e celular, claro e escuro): Painel, DRE e Campanhas.
import { chromium, devices } from "playwright";
const OUT = process.argv[2] ?? "docs/prints";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const telas = [["desktop", { viewport: { width: 1360, height: 900 } }], ["celular", devices["iPhone 13"]]];
const paginas = [["painel", "/?p=hoje", ".hero"], ["dre", "/dre?p=hoje", "h1:has-text(\"DRE do período\")"], ["campanhas", "/campanhas?p=hoje", "h1:has-text(\"Campanhas\")"]];
for (const [tela, opts] of telas) for (const tema of ["claro", "escuro"]) {
  const c = await b.newContext({ ...opts, locale: "pt-BR" }); const p = await c.newPage();
  await p.goto("http://localhost:3000/login"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(600);
  await p.evaluate((t) => { localStorage.setItem("tema", t); document.documentElement.dataset.theme = t; }, tema === "escuro" ? "dark" : "light");
  await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.click("button:has-text('Entrar')"); await p.waitForURL("http://localhost:3000/");
  for (const [nome, rota, espera] of paginas) {
    await p.goto(`http://localhost:3000${rota}`); await p.waitForSelector(espera); await p.waitForLoadState("networkidle"); await p.waitForTimeout(500);
    if (nome === "painel") { try { await p.click("#indicadores .secao-cab"); await p.waitForTimeout(300); } catch {} }
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    await p.addStyleTag({ content: ".barra-inferior { position: static !important; }" }); // no print de página inteira, a barra fixa aparece uma vez, no fim
    await p.screenshot({ path: `${OUT}/${nome}-${tela}-${tema}.png`, fullPage: true });
    if (nome === "dre" && tela === "desktop") {
      const topo = await p.evaluate(() => { const t = document.querySelector(".topo")?.getBoundingClientRect().height ?? 0; const h = document.querySelector(".barra-hoje")?.getBoundingClientRect().height ?? 0; return { topo: t, hoje: h, total: t + h }; });
      console.log("altura topo+barra Hoje (desktop):", JSON.stringify(topo));
    }
  }
  await c.close();
}
await b.close();
console.log("prints gerados em", OUT);
