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
    page.getByRole("heading", { name: "Semana" }),
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
  await page.getByTestId("weekly-save").click();
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

  // 4. Editor de dia: refeição + item, conferindo o total do dia
  await page.goto("/");
  await page.getByTestId("day-card-0").click();
  await expect(page).toHaveURL(/\/day\//);
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

  // 5. Dashboard: card do dia mapeado ao tipo criado
  await page.goto("/");
  await expect(page.getByTestId("day-card-0")).toBeVisible();
  await expect(page.getByTestId("day-card-0")).toContainText(dayTypeName);
});
