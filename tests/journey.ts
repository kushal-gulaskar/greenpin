import { expect, type Page } from "@playwright/test";
export async function cloudJourney(page: Page, login: () => Promise<void>) {
  await page.goto("/");
  await login();
  await expect(
    page.getByRole("heading", { name: "Conservation overview" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Register tree", exact: true }).click();
  const name = "QA neem " + crypto.randomUUID();
  await page.getByLabel("Common name").fill(name);
  await page.getByLabel("Species", { exact: true }).selectOption("Neem");
  await page
    .getByLabel("Tree photograph")
    .setInputFiles("public/images/canopy.jpg");
  await page.getByLabel("Latitude").fill("12");
  await page.getByLabel("Longitude").fill("77");
  await page.getByLabel("Location description").fill("Isolated QA garden");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await button("Save tree").click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const path = new URL(page.url()).pathname;
  await button("Growth").click();
  await page.getByLabel("Height (cm)", { exact: true }).fill("120");
  await page.getByLabel("Trunk circumference").fill("21");
  await page.getByLabel("Leaf condition").fill("Green");
  await page.getByLabel("Health status").selectOption("Healthy");
  await button("Save measurement").click();
  await expect(page.getByText("Record saved.")).toBeVisible();
  await button("Maintenance").click();
  await button("Save maintenance").click();
  await expect(page.locator(".timeline")).toContainText("Watering");
  await page.goto("/profile");
  page.once("dialog", (d) => d.accept());
  await button("Sign out").click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await login();
  await page.goto(path);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText(name)
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await button("History").click();
  await expect(page.locator(".timeline")).toContainText("120 cm");
  await expect(page.locator(".timeline")).toContainText("Watering");
  return path.split("/").pop()!;
}
