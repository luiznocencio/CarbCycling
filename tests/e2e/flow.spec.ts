import { test, expect } from "@playwright/test";

test("fluxo principal: signup -> metas -> alimento -> cardápio -> dashboard", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const runId = Date.now();
  const email = `test_${runId}@example.com`;
  const password = "Senha123!";
  const dayTypeName = "Baixo carbo";
  const foodName = `Peito de Frango E2E ${runId}`;

  // 1. Signup
  await page.goto("/login");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "Semana", exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  // 2. Settings: perfil completo (basal real) + tipo de dia + padrão + recálculo semanal
  await page.goto("/settings");
  await page.getByTestId("profile-weight").fill("80");
  await page.getByTestId("profile-sex").selectOption("male");
  await page.getByTestId("profile-age").fill("30");
  await page.getByTestId("profile-height").fill("178");
  await page.getByTestId("profile-goal").selectOption("maintenance");
  await page.getByTestId("profile-intensity").selectOption("moderate");
  await page.getByTestId("profile-activity").selectOption("moderate");
  await page.getByTestId("profile-save").click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();

  // Com o perfil completo, o preview de BMR/TDEE aparece
  await expect(page.getByTestId("tdee-preview")).toBeVisible();

  // Cria o tipo de dia "Baixo carbo" (abre o form de criação; único enquanto não há linhas)
  await page.getByRole("button", { name: "+ Novo tipo de dia" }).click();
  await page.getByTestId("daytype-name").fill(dayTypeName);
  await page.getByTestId("daytype-carblevel").selectOption("low");
  await page.getByTestId("daytype-save").click();
  await expect(
    page.getByTestId("daytype-row").filter({ hasText: dayTypeName }),
  ).toBeVisible();

  // Define o padrão semanal (domingo = Baixo carbo)
  await page.reload();
  await page
    .getByTestId("weekday-select-0")
    .selectOption({ label: dayTypeName });
  // force: bloco no fim de uma página longa; o dev-server (sticky header + indicador
  // do Next dev tools) engana o hit-test do Playwright mesmo com o botão desobstruído.
  await page.getByTestId("weekly-save").click({ force: true });
  await expect(page.getByText("Padrão salvo.")).toBeVisible();

  // Recalcula as metas da semana e confere o resumo
  await page.getByTestId("recalc-targets").click();
  await expect(page.getByTestId("weekly-summary")).toBeVisible();
  await expect(page.getByTestId("weekly-avg")).toBeVisible();
  expect(
    Number((await page.getByTestId("weekly-avg").innerText()).replace(/\D/g, "")),
  ).toBeGreaterThan(0);

  // 3. Alimentos: cadastro de alimento próprio
  await page.goto("/foods");
  await page
    .getByRole("button", { name: "Cadastrar alimento próprio" })
    .click();
  await page.getByTestId("food-name-input").fill(foodName);
  await page.getByTestId("food-kcal-input").fill("165");
  await page.getByTestId("food-protein-input").fill("31");
  await page.getByTestId("food-carbs-input").fill("0");
  await page.getByTestId("food-fat-input").fill("3.6");
  await page.getByTestId("food-save").click();

  const foodRow = page.getByTestId("food-row").filter({ hasText: foodName });
  await expect(foodRow).toBeVisible();
  await expect(foodRow.getByText("Meu")).toBeVisible();

  // Favoritar o alimento (⭐) e confirmar via API
  const foodsRes = await page.request.get(`/api/foods?q=${encodeURIComponent(foodName)}`);
  const foodId = ((await foodsRes.json()) as { id: string; name: string }[]).find(
    (f) => f.name === foodName,
  )!.id;
  await foodRow.getByTestId("food-favorite").click();
  await expect
    .poll(async () => (await (await page.request.get("/api/favorites")).json()).ids as string[])
    .toContain(foodId);

  // 4. Editor de dia: refeição + item, conferindo o total do dia
  await page.goto("/");
  await page.getByTestId("day-card-0").click();
  await expect(page).toHaveURL(/\/day\//);
  const dayTypeId = /\/day\/([^/?]+)/.exec(page.url())![1];
  await expect(
    page.getByRole("heading", { name: dayTypeName }),
  ).toBeVisible();

  await page.getByTestId("meal-name-input").fill("Almoço");
  await page.getByTestId("add-meal").click();
  await expect(page.getByTestId("meal-card")).toBeVisible();

  await page.getByTestId("item-food-search").fill(foodName);
  await page.getByRole("button", { name: foodName }).click();
  await page.getByTestId("item-qty-input").fill("200");
  await page.getByTestId("item-add").click();

  // 165 kcal/100g * 200g = 330 kcal
  await expect(page.getByTestId("day-total-kcal")).toHaveText("330");

  // Adiciona um alimento TACO COM unidade (ovo), por unidade
  const eggName = "Ovo, de galinha, inteiro, cozido";
  await page.getByTestId("item-food-search").fill(eggName);
  await page.getByRole("button", { name: new RegExp(eggName) }).click();
  // alimento com unidade → o toggle aparece (default "unidade")
  await expect(page.getByTestId("item-unit-toggle")).toBeVisible();
  await page.getByTestId("item-qty-input").fill("2");
  await page.getByTestId("item-add").click();
  // 2 unidades × 50g = 100g → item exibido com a unidade e as gramas derivadas
  await expect(
    page.getByTestId("item-display").filter({ hasText: "unidade" }),
  ).toContainText("(100");
  // total do dia aumentou além dos 330
  await expect
    .poll(async () =>
      Number((await page.getByTestId("day-total-kcal").innerText()).replace(/\D/g, "")),
    )
    .toBeGreaterThan(330);

  // 5. Dashboard: card do dia mapeado ao tipo criado
  await page.goto("/");
  await expect(page.getByTestId("day-card-0")).toBeVisible();
  await expect(page.getByTestId("day-card-0")).toContainText(dayTypeName);

  // 6. Aplicar uma proposta fixa (sem IA) + trocar de opção muda o total do dia
  const proposal = {
    slots: [
      {
        name: "Teste",
        slot: 0,
        options: [
          { label: "Opção 1", items: [{ food_id: foodId, quantity: 100, unit: "g" }] },
          { label: "Opção 2", items: [{ food_id: foodId, quantity: 300, unit: "g" }] },
        ],
      },
    ],
  };
  const applyRes = await page.request.post(`/api/day-types/${dayTypeId}/apply-menu`, {
    data: { proposal },
  });
  expect(applyRes.ok()).toBeTruthy();

  await page.goto(`/day/${dayTypeId}`);
  await expect(page.getByTestId("option-tab")).toHaveCount(2);
  // Opção 1 (100 g de frango, 165 kcal/100g) selecionada por default
  await expect(page.getByTestId("day-total-kcal")).toHaveText("165");
  // Troca para a Opção 2 (300 g = 495 kcal): aguarda o PUT de seleção persistir, recarrega e confere
  const [selResp] = await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/meals\/[0-9a-f-]+$/.test(r.url()) && r.request().method() === "PUT",
    ),
    page.getByTestId("option-tab").nth(1).click(),
  ]);
  expect(selResp.ok()).toBeTruthy();
  await page.goto(`/day/${dayTypeId}`);
  await expect
    .poll(async () =>
      Number((await page.getByTestId("day-total-kcal").innerText()).replace(/\D/g, "")),
    )
    .toBe(495);

  // 7. C2: cria uma 3ª opção MANUAL no slot e confirma que aparece como aba
  const addOptRes = await page.request.post("/api/meals", {
    data: {
      day_type_id: dayTypeId,
      name: "Teste",
      slot: 0,
      order: 0,
      option_label: "Opção 3",
      selected: false,
    },
  });
  expect(addOptRes.ok()).toBeTruthy();
  await page.goto(`/day/${dayTypeId}`);
  await expect(page.getByTestId("option-tab")).toHaveCount(3);
  // A Opção 2 segue selecionada → total do dia continua 495
  await expect
    .poll(async () =>
      Number((await page.getByTestId("day-total-kcal").innerText()).replace(/\D/g, "")),
    )
    .toBe(495);

  // 8. E1: preferências — salvar formulário e conferir persistência (sem IA)
  await page.goto("/preferences");
  // adiciona um item em "Evitar" e um em "Gosto" pelo formulário
  await page.getByTestId("prefs-avoid-input").fill("Peixe");
  await page.getByTestId("prefs-avoid-input").press("Enter");
  await page.getByTestId("prefs-likes-input").fill("Ovo");
  await page.getByTestId("prefs-likes-input").press("Enter");
  await page.getByTestId("prefs-save").click();
  await expect(page.getByText("Preferências salvas.")).toBeVisible();
  const prefsRes = await page.request.get("/api/preferences");
  const saved = await prefsRes.json();
  expect(saved.avoid).toContain("Peixe");
  expect(saved.likes).toContain("Ovo");

  // 9. E2: aplicar semana (proposta fixa, sem IA) via /api/week/apply
  const weekProposal = {
    week: [
      {
        day_type_id: dayTypeId,
        proposal: {
          slots: [
            {
              name: "Café",
              slot: 0,
              options: [
                { label: "Opção 1", items: [{ food_id: foodId, quantity: 100, unit: "g" }] },
                { label: "Opção 2", items: [{ food_id: foodId, quantity: 200, unit: "g" }] },
              ],
            },
          ],
        },
      },
    ],
  };
  const weekRes = await page.request.post("/api/week/apply", { data: weekProposal });
  expect(weekRes.ok()).toBeTruthy();
  const weekBody = await weekRes.json();
  expect(weekBody.applied).toBe(1);
  // week/apply substitui as refeições do tipo de dia: agora há 1 slot com 2 opções
  await page.goto(`/day/${dayTypeId}`);
  await expect(page.getByTestId("option-tab")).toHaveCount(2);
  // Opção 1 (100 g de frango, 165 kcal/100g) selecionada por default → total 165
  await expect
    .poll(async () =>
      Number((await page.getByTestId("day-total-kcal").innerText()).replace(/\D/g, "")),
    )
    .toBe(165);

  // 10. D: registrar peso (histórico) + apply-adjustment (sem IA)
  // Registro antigo (histórico) + registro de hoje (vira o mais recente → espelha em profiles.weight_kg).
  await page.request.post("/api/weight", {
    data: { weight_kg: 82, logged_on: "2020-01-01" },
  });
  const wRes = await page.request.post("/api/weight", { data: { weight_kg: 79.6 } });
  expect(wRes.ok()).toBeTruthy();
  const hist = await (await page.request.get("/api/weight")).json();
  expect(hist.length).toBeGreaterThanOrEqual(2);
  // profiles.weight_kg reflete o registro mais recente (hoje = 79.6)
  const prof = await (await page.request.get("/api/profile")).json();
  expect(Number(prof.weight_kg)).toBe(79.6);
  // apply-adjustment com delta fixo altera o kcal_adjustment acumulado
  const adj = await page.request.post("/api/weight/apply-adjustment", {
    data: { delta: -150 },
  });
  expect(adj.ok()).toBeTruthy();
  const adjBody = await adj.json();
  expect(adjBody.kcal_adjustment).toBe(-150);
  // A página /weight carrega com formulário e histórico
  await page.goto("/weight");
  await expect(page.getByTestId("weight-form")).toBeVisible();
  await expect(page.getByTestId("weight-history")).toBeVisible();
});
