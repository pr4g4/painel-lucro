import { chromium, devices } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ ...devices["iPhone 13"], locale: "pt-BR" });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
p.on("console", (m) => { if (m.type() === "error" || /hydrat/i.test(m.text())) erros.push(`console(${m.type()}): ${m.text().slice(0, 200)}`); });
await p.goto("http://localhost:3000/login"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.tap("button:has-text('Entrar')");
await p.waitForURL("http://localhost:3000/"); await p.waitForLoadState("networkidle");
let falhas = 0;
const chk = (nome, ok, extra = "") => { console.log(`${ok ? "OK " : "FALHA"} ${nome} ${extra}`); if (!ok) falhas++; };

// menu: abrir gaveta e tocar em CADA link
const rotas = [["Resumo", "/resumo"], ["DRE", "/dre"], ["Campanhas", "/campanhas"], ["Lançamentos manuais", "/manuais"], ["Venda manual", "/venda-manual"], ["Custos por tipo", "/custos"], ["Lançamentos", "/lancamentos"], ["Por produto", "/produtos"], ["Avisos", "/avisos"], ["Parâmetros", "/parametros"], ["Painel", "/"]];
for (const [rotulo, rota] of rotas) {
  await p.tap("button[aria-label='Abrir menu']");
  await p.waitForSelector(".gaveta", { timeout: 3000 });
  await p.locator(`.gaveta a.nav-item:text-is("${rotulo}")`).tap();
  await p.waitForTimeout(900);
  chk(`menu → ${rotulo}`, new URL(p.url()).pathname === rota, p.url());
  chk("gaveta fechou", (await p.locator(".gaveta").count()) === 0);
}
// atalhos de período: tocar em cada chip
await p.goto("http://localhost:3000/"); await p.waitForLoadState("networkidle");
for (const [rotulo, q] of [["Hoje", "p=hoje"], ["Últimas 6 h", "p=ultimas_6h"], ["Últimas 24 h", "p=ultimas_24h"], ["Ontem", "p=ontem"], ["7 dias", "p=7_dias"], ["Mês atual", "p=mes_atual"], ["Tudo (com histórico)", "p=tudo"], ["Desde o marco zero", "p=marco_zero"]]) {
  const el = p.locator(`button.chip:text-is("${rotulo}")`).first();
  await el.scrollIntoViewIfNeeded(); await el.tap(); await p.waitForTimeout(1200);
  chk(`chip ${rotulo}`, p.url().includes(q), p.url());
}
// personalizado
await p.locator("button.chip:text-is('Personalizado')").tap(); await p.fill("input[type=datetime-local] >> nth=0", "2026-10-03T00:00"); await p.fill("input[type=datetime-local] >> nth=1", "2026-10-03T06:00"); await p.tap("button:has-text('Aplicar')"); await p.waitForTimeout(1200);
chk("personalizado", p.url().includes("de=2026-10-03T00%3A00") || p.url().includes("de=2026-10-03T00:00"), p.url());
// tema, atualizar, sair
const t0 = await p.evaluate(() => document.documentElement.dataset.theme);
await p.tap("button[aria-label='Abrir menu']"); await p.locator(".gaveta button[aria-label='Alternar tema']").tap(); await p.waitForTimeout(300);
chk("tema alterna", (await p.evaluate(() => document.documentElement.dataset.theme)) !== t0);
await p.locator(".gaveta button:has-text('Sair')").tap(); await p.waitForTimeout(1500);
chk("sair", p.url().includes("/login"), p.url());
// cobertura em todas as páginas (nada por cima de botão visível)
await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
await p.fill('input[name=usuario]', "erick"); await p.fill('input[name=senha]', "erick123"); await p.tap("button:has-text('Entrar')"); await p.waitForURL("http://localhost:3000/");
for (const rota of ["/", "/resumo", "/dre", "/campanhas", "/manuais", "/venda-manual", "/custos", "/lancamentos", "/produtos", "/avisos", "/parametros"]) {
  await p.goto(`http://localhost:3000${rota}`); await p.waitForLoadState("networkidle");
  const r = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("a, button, summary, select")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.closest("details:not([open])") && el.tagName !== "SUMMARY") continue; // dentro de painel recolhido
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!(top === el || el.contains(top))) out.push(`${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20)} ← ${top?.tagName}`);
    }
    return { cobertos: out, overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  chk(`página ${rota}: nada cobrindo botões`, r.cobertos.length === 0, r.cobertos.join("; "));
  chk(`página ${rota}: sem rolagem horizontal`, !r.overflowX);
}
console.log("erros de página/console:", erros.length ? erros : "nenhum");
console.log(falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`);
await b.close();
process.exit(falhas ? 1 : 0);
