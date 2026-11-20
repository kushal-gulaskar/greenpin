import { test, expect, type Page } from "@playwright/test";
import { cloudJourney } from "./journey";
import { randomInt, randomUUID } from "node:crypto";
async function fixture(page: Page) {
  const code = String(randomInt(100000, 999999)),
    uid = randomUUID(),
    phone = "+919000000007";
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    phone,
    app_metadata: { provider: "phone", providers: ["phone"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const jwt = [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(
      JSON.stringify({
        sub: uid,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
      }),
    ).toString("base64url"),
    "c2ln",
  ].join(".");
  const tables: Record<string, Record<string, any>[]> = {
      species: [{ id: "s", common_name: "Neem" }],
    },
    objects = new Map<string, Buffer>();
  let failUpload = false;
  await page.route("https://greenpin-test.invalid/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (path.endsWith("/otp")) return json({});
    if (path.endsWith("/verify"))
      return req.postDataJSON().token !== code
        ? json({ error_code: "otp_expired", msg: "Expired" }, 403)
        : json({
            access_token: jwt,
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "fixture-refresh",
            user,
          });
    if (path.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (path.endsWith("/auth/v1/user")) return json(user);
    if (path.includes("/storage/v1/object/")) {
      const key = path.split("tree-photos/")[1];
      if (method === "POST") {
        if (failUpload) return json({ message: "Storage unavailable" }, 503);
        const b = req.postDataBuffer()!;
        // The SDK uses multipart for browser Blobs. Extract the JPEG fixture.
        const start = b.indexOf(Buffer.from([255, 216])),
          end = b.lastIndexOf(Buffer.from([255, 217]));
        objects.set(key, b.subarray(start, end + 2));
        return json({ Key: key });
      }
      if (!objects.has(key)) return json({ message: "missing" }, 404);
      return route.fulfill({
        contentType: "image/jpeg",
        body: objects.get(key)!,
      });
    }
    const name = path.split("/").pop()!;
    if (name === "profiles")
      return method === "GET"
        ? json({
            display_name: "Test caretaker",
            city: "",
            state: "",
            preferred_language: "",
          })
        : route.fulfill({ status: 201 });
    const table = (n: string) => tables[n] ?? (tables[n] = []);
    if (name === "gp_register") {
      const { t, d, p } = req.postDataJSON();
      if (!table("trees").some((r) => r.id === t)) {
        table("trees").push({
          id: t,
          registered_by: uid,
          name: d.name,
          species_id: "s",
          registration_type: d.kind,
          created_at: d.created,
          location_description: d.location,
          health_status: d.health,
        });
        table("gp_coordinates").push({ tree_id: t, lat: d.lat, lng: d.lng });
        table("tree_photos").push({
          tree_id: t,
          photo_type: "registration",
          storage_path: p,
        });
      }
      return route.fulfill({ status: 204 });
    }
    if (name === "gp_observe") {
      const { t, e, d, p } = req.postDataJSON(),
        base = {
          id: e,
          tree_id: t,
          recorded_by: uid,
          created_at: d.created ?? new Date().toISOString(),
          notes: d.notes,
          photo_path: p,
        };
      if (d.kind === "growth") {
        table("tree_growth_records").push({
          ...base,
          height_cm: d.height,
          circumference_cm: d.circumference,
          leaf_condition: d.leaves,
          health_status: d.health,
          observation_date: d.day,
        });
        table("tree_health_observations").push({
          ...base,
          id: d.healthId ?? randomUUID(),
          growth_id: e,
          observed_at: d.day,
          health_status: d.health,
        });
      }
      if (d.kind === "maintenance")
        table("tree_maintenance").push({
          ...base,
          performed_by: uid,
          activity_type: d.activity,
          activity_date: d.when,
        });
      return route.fulfill({ status: 204 });
    }
    const offset = Number(new URL(req.url()).searchParams.get("offset") ?? 0);
    return json(table(name).slice(offset, offset + 200));
  });
  const login = async () => {
    await page.getByLabel("Mobile number").fill(phone);
    await page.getByRole("button", { name: "Request code" }).click();
    await page.getByLabel("One-time code").fill(code);
    await page.getByRole("button", { name: "Verify code" }).click();
  };
  return {
    login,
    code,
    tables,
    objects,
    setFailure: (value: boolean) => {
      failUpload = value;
    },
  };
}
test("authenticated registry journey through the SDK", async ({ page }) => {
  const f = await fixture(page);
  await cloudJourney(page, f.login);
});
test("protected route, phone validation, OTP errors, persisted session and sign-out", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/profile");
  await page.getByLabel("Mobile number").fill("123");
  await page.getByRole("button", { name: "Request code" }).click();
  await expect(page.getByRole("alert")).toContainText("valid 10-digit");
  await page.getByLabel("Mobile number").fill("90000 00007");
  await page.getByRole("button", { name: "Request code" }).click();
  await expect(page.getByRole("button", { name: /Resend/ })).toBeDisabled();
  await page.getByLabel("One-time code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect or expired");
  await page.getByLabel("One-time code").fill(f.code);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Test caretaker");
  await page.reload();
  await expect(page.getByLabel("Display name")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
test("rate-limited code delivery keeps the registry protected", async ({
  page,
}) => {
  await page.route("https://greenpin-test.invalid/auth/v1/otp*", (r) =>
    r.fulfill({ status: 429, json: { message: "Rate limited" } }),
  );
  await page.goto("/trees");
  await page.getByLabel("Mobile number").fill("9000000007");
  await page.getByRole("button", { name: "Request code" }).click();
  await expect(page.getByRole("alert")).toContainText("Too many attempts");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("confirmed import retries a failed photo, preserves IDs and history, and flags demo identities", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/import");
  await f.login();
  const id = await page.evaluate(async () => {
    const dataPath = "/src/data.ts",
      journalPath = "/src/journal.ts";
    const { repository, openDatabase } = await import(dataPath),
      { journal } = await import(journalPath);
    const id = crypto.randomUUID(),
      photo = await (await fetch("/images/light.jpg")).blob();
    await repository.add({
      id,
      photo,
      name: "Original neem",
      species: "Neem",
      scientific: "",
      kind: "Existing tree",
      created: "2025-01-01T00:00:00Z",
      lat: 12,
      lng: 77,
      location: "Garden",
      health: "Healthy",
      age: "",
      planted: "",
      notes: "",
      adopted: false,
      demo: false,
    });
    await journal.save(id, {
      kind: "growth",
      height: 100,
      circumference: 10,
      leaves: "Green",
      health: "Healthy",
      day: "2025-01-02",
      notes: "",
      photo,
    });
    await journal.save(id, { kind: "request" });
    const db = await openDatabase();
    db.close();
    return id;
  });
  await page.reload();
  await expect(
    page.getByText("1 local trees · 3 journal entries"),
  ).toBeVisible();
  const start = page.getByRole("button", { name: "Import and verify" });
  await expect(start).toBeDisabled();
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export backup/ }).click();
  expect((await backup).suggestedFilename()).toContain("backup");
  f.setFailure(true);
  await page.getByRole("checkbox").check();
  await start.click();
  await expect(page.getByRole("status")).toContainText("Trees 0");
  f.setFailure(false);
  await page.getByRole("checkbox").check();
  await start.click();
  await expect(page.getByRole("status")).toContainText(
    "Trees 1 · Photos 2 · Growth 1",
  );
  await expect(page.getByText(/resolve tree or demo caretaker/)).toBeVisible();
  expect(f.tables.trees[0].id).toBe(id);
  await page.getByRole("checkbox").check();
  await start.click();
  await expect(page.getByRole("status")).toContainText("Skipped 2");
  expect(f.tables.tree_growth_records.length).toBe(1);
  await page.reload();
  await expect(
    page.getByText("1 local trees · 3 journal entries"),
  ).toBeVisible();
});
