import { chromium } from "playwright";
const OUT = "/tmp/claude-0/-home-user-painel-lucro/a6a5e0bb-c97e-5f26-b5a7-06b735ce900b/scratchpad/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
p.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });

// senha errada → mensagem; depois login certo
await p.goto("http://localhost:3000/dre"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
console.log("redirecionou para", p.url());
await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "errada"); await p.click("button:has-text('Entrar')");
await p.waitForSelector("[role=alert]:not(:empty)"); console.log("erro login:", await p.textContent("[role=alert]"));
await p.fill('input[name=senha]', "erick123"); await p.click("button:has-text('Entrar')");
await p.waitForURL("**/dre*"); console.log("após login:", p.url());
await p.screenshot({ path: `${OUT}/dre.png`, fullPage: true });

await p.goto("http://localhost:3000/"); await p.waitForSelector("text=Lucro líquido");
await p.screenshot({ path: `${OUT}/painel.png`, fullPage: true });
const lucroPainel = await p.locator(".hero .hero-v").textContent();
await p.goto("http://localhost:3000/dre");
const lucroDre = await p.locator("h1 span").textContent();
console.log("lucro painel:", lucroPainel, "| dre:", lucroDre);

// personalizado + intervalos
await p.goto("http://localhost:3000/dre?de=2026-10-03T00:00&ate=2026-10-03T06:00&tz=America/Sao_Paulo");
await p.click("button:has-text('Analisar por intervalo')"); await p.click("button[aria-label=expandir] >> nth=0");
await p.screenshot({ path: `${OUT}/dre-intervalos.png`, fullPage: true });

for (const rota of ["campanhas", "manuais", "venda-manual", "custos", "lancamentos", "produtos", "avisos", "parametros"]) {
  const r = await p.goto(`http://localhost:3000/${rota}`); console.log(rota, r.status());
  await p.screenshot({ path: `${OUT}/${rota}.png`, fullPage: rota !== "lancamentos" });
}
// cria lançamento manual e confere que aparece no painel sem coleta
await p.goto("http://localhost:3000/manuais?p=hoje"); await p.waitForLoadState("networkidle");
await p.fill("input[name=valor]", "37,50"); await p.fill("input[name=descricao]", "TESTE e2e avulso"); await p.click("button:has-text('Adicionar')");
await p.waitForSelector("text=TESTE e2e avulso"); console.log("manual criado ok");
await p.goto("http://localhost:3000/lancamentos?p=hoje&fonte=manual"); console.log("no ledger:", await p.locator("text=TESTE e2e avulso").count());
// venda manual
await p.goto("http://localhost:3000/venda-manual?p=hoje"); await p.waitForLoadState("networkidle");
await p.fill("input[name=bruto]", "149"); await p.fill("input[name=produto]", "Fotos IA 149 (manual)"); await p.click("button:has-text('Registrar venda')");
await p.waitForSelector("text=Fotos IA 149 (manual)"); console.log("venda manual ok");
// parâmetro nova vigência
await p.goto("http://localhost:3000/parametros");
const det = p.locator("details:has-text('Imposto sobre lucro (%)')"); await det.locator("summary").click();
await det.locator("input[name=valor]").fill("9"); await det.locator("button:has-text('Aplicar nova vigência')").click();
await p.waitForTimeout(800); console.log("vigências imposto:", await p.locator("details:has-text('Imposto sobre lucro (%)') tbody tr").count());
// tema escuro + celular
await p.evaluate(() => { document.documentElement.dataset.theme = "dark"; localStorage.setItem("tema", "dark"); });
await p.goto("http://localhost:3000/"); await p.waitForSelector("text=Lucro líquido"); await p.screenshot({ path: `${OUT}/painel-dark.png`, fullPage: true });
const m = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
const mp = await m.newPage(); await mp.goto("http://localhost:3000/"); await mp.waitForSelector("text=Lucro líquido"); await mp.screenshot({ path: `${OUT}/painel-mobile.png`, fullPage: true });
// Ian só vê
const i = await b.newContext(); const ip = await i.newPage(); await ip.goto("http://localhost:3000/login"); await ip.waitForLoadState("networkidle"); await ip.waitForTimeout(1500);
await ip.fill('input[name=usuario]', "ian"); await ip.fill('input[name=senha]', "ian123"); await ip.click("button:has-text('Entrar')"); await ip.waitForURL("http://localhost:3000/");
await ip.goto("http://localhost:3000/manuais"); console.log("ian vê formulário de adicionar?", await ip.locator("button:has-text('Adicionar')").count());
console.log("erros de página/console:", erros.length ? erros : "nenhum");
await b.close();
