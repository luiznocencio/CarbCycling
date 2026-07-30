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

  // 2. Settings: perfil + tipo de dia com sugestão de metas
  await page.goto("/settings");
  await page.getByTestId("profile-weight").fill("80");
  await page.getByTestId("profile-goal").selectOption({ label: "Manutenção" });
  await page
    .getByTestId("profile-activity")
    .selectOption({ label: "Moderado" });
  await page.getByTestId("profile-save").click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();

  await page.getByRole("button", { name: "+ Novo tipo de dia" }).click();
  await page.getByTestId("daytype-name").fill(dayTypeName);
  await page
    .getByTestId("daytype-carblevel")
    .selectOption({ label: "Baixo carbo" });
  await page.getByTestId("daytype-suggest").click();

  const kcalInput = page.getByLabel("Kcal");
  await expect(kcalInput).not.toHaveValue("");
  const kcalValue = Number(await kcalInput.inputValue());
  expect(kcalValue).toBeGreaterThan(0);

  await page.getByTestId("daytype-save").click();
  await expect(
    page.getByTestId("daytype-row").filter({ hasText: dayTypeName }),
  ).toBeVisible();

  // Recarrega para que o padrão semanal enxergue o tipo de dia recém-criado
  await page.reload();
  await page
    .getByTestId("weekday-select-0")
    .selectOption({ label: dayTypeName });
  await page.getByTestId("weekly-save").click();
  await expect(page.getByText("Padrão salvo.")).toBeVisible();

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
