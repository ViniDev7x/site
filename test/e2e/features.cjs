const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
const executablePath = process.env.CHROMIUM_EXECUTABLE;
fs.mkdirSync("test-results", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  for (const file of [
    "/.local/admin-token",
    "/.local/nexora.sqlite",
    "/@fs" + path.resolve(".local/admin-token"),
  ]) {
    const r = await context.request.get(base + file);
    if (r.status() !== 403) throw Error("Private file not blocked: " + file);
  }
  await page
    .getByRole("heading", { name: "Survival dos amigos", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Criar serviço", exact: true })
    .click();
  await page.getByRole("button", { name: "Sites Sua ideia no ar." }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Next.js", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByPlaceholder("Meu projeto incrível")
    .fill("Site com preço dinâmico");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  const price = page.getByTestId("price-total");
  const before = await price.textContent();
  await page.getByLabel("CPU", { exact: true }).fill("3");
  await page.getByLabel("CPU", { exact: true }).blur();
  await page.waitForTimeout(400);
  if ((await price.textContent()) === before)
    throw Error("CPU did not affect price");
  await page.getByLabel("Ciclo de cobrança").selectOption("annual");
  await page.getByLabel(/Backup estendido/).check();
  await page.getByText("Desconto de 20% no ciclo").waitFor();
  await page.screenshot({ path: "test-results/wizard.png", fullPage: true });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel(/Aceito a política/).check();
  await page
    .getByRole("button", { name: "Criar demonstração", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Tour do serviço", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Pular tour", exact: true }).click();
  await page
    .getByRole("heading", { name: "Site com preço dinâmico", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Concluir Configurar backup", exact: true })
    .click();
  await page.getByText("1 de 4 etapas concluídas", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Guia de Sites", exact: false })
    .click();
  await page
    .getByRole("heading", { name: "Publique seu site", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Gerenciar Site com preço dinâmico" })
    .click();
  await page
    .getByRole("button", { name: "Desmarcar Configurar backup", exact: true })
    .waitFor();
  if (await page.getByRole("dialog", { name: "Tour do serviço" }).count())
    throw Error("Tour repeated on reload");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByLabel("Endereço personalizado").fill("app.community.example");
  await page
    .getByRole("button", { name: "Salvar endereço", exact: true })
    .click();
  await page
    .getByLabel("E-mail do colaborador")
    .fill("colaborador@example.com");
  await page
    .getByRole("button", { name: "Registrar convite", exact: true })
    .click();
  await page.getByText("colaborador@example.com", { exact: true }).waitFor();
  await page.getByLabel(/IP dedicado/).check();
  await page
    .getByRole("button", { name: "Calcular adicional", exact: true })
    .click();
  await page.getByRole("button", { name: /Confirmar adicional/ }).click();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("label"))
        .find((l) => l.textContent.includes("IP dedicado"))
        ?.querySelector("input")?.disabled === true,
  );
  await page.getByRole("button", { name: "Afiliados", exact: true }).click();
  await page.getByLabel("Nome da marca").fill("Clan Aurora");
  await page.getByRole("button", { name: "Salvar marca e revenda" }).click();
  await page.getByLabel("Link de indicação").waitFor();
  const link = await page.getByLabel("Link de indicação").inputValue();
  if (!link.includes("?ref=")) throw Error("No referral link");
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/affiliate.png", fullPage: true });
  await page.getByRole("button", { name: "Marketplace", exact: true }).click();
  await page
    .getByRole("heading", { name: "Portfolio Starter", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Usar no novo serviço" })
    .last()
    .click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Template do marketplace").selectOption("portfolio");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Administração", exact: true })
    .click();
  await page
    .getByLabel("Token administrativo")
    .fill(fs.readFileSync(path.resolve(".local/admin-token"), "utf8").trim());
  await page.getByRole("button", { name: "Entrar na administração" }).click();
  await page.getByRole("heading", { name: "Estado das integrações" }).waitFor();
  await page.screenshot({ path: "test-results/admin.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Afiliados", exact: true }).click();
  await page.getByRole("heading", { name: "White label & revenda" }).waitFor();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile affiliate overflow");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: live pricing, annual discount/addons, backend provision, tour persistence, checklist, guide, affiliate brand/link, marketplace, authenticated admin, mobile; no JS errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
