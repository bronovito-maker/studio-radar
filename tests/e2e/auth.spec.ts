import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL("/");
}

test("un visitatore anonimo viene reindirizzato al login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Bentornato" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accedi" })).toBeVisible();
});

test("le route operative non espongono dati senza sessione", async ({ page }) => {
  for (const path of ["/leads", "/search", "/import", "/outreach", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("il cron rifiuta richieste senza secret", async ({ request }) => {
  const response = await request.get("/api/cron/discovery");
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
});

test("cron email e webhook Brevo usano i secret macchina", async ({ request }) => {
  const cronResponse = await request.get("/api/cron/email-followups");
  expect(cronResponse.status()).toBe(401);
  await expect(cronResponse.json()).resolves.toEqual({ error: "UNAUTHORIZED" });

  const webhookResponse = await request.post("/api/webhooks/brevo", {
    data: { event: "delivered" },
  });
  expect(webhookResponse.status()).toBe(401);
  await expect(webhookResponse.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
});

test.describe("sessione admin", () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, "Credenziali E2E admin non configurate");

  test("raggiunge tutte le aree operative", async ({ page }) => {
    await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);

    for (const [path, heading] of [
      ["/", "Cruscotto operativo"],
      ["/leads", "Lead"],
      ["/search", "Ricerca lead"],
      ["/import", "Importa lead"],
      ["/outreach", "Coda outreach"],
      ["/settings", "Impostazioni"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });
});

test.describe("sessione collaboratore", () => {
  test.skip(!process.env.E2E_COLLABORATOR_EMAIL || !process.env.E2E_COLLABORATOR_PASSWORD, "Credenziali E2E collaboratore non configurate");

  test("non accede alle impostazioni amministrative", async ({ page }) => {
    await login(page, process.env.E2E_COLLABORATOR_EMAIL!, process.env.E2E_COLLABORATOR_PASSWORD!);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/?error=Accesso/);
    await expect(page.getByRole("heading", { name: "Cruscotto operativo", level: 1 })).toBeVisible();
  });
});
