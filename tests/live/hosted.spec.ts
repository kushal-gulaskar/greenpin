import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { cloudJourney } from "../journey";
test("hosted private registration, persistence and caretaker authorization", async ({
  page,
}) => {
  const env = process.env,
    phone = env.GREENPIN_QA_PHONE_A!;
  const id = await cloudJourney(page, async () => {
    await page.getByLabel("Mobile number").fill(phone);
    await page.getByRole("button", { name: "Request code" }).click();
    await page.getByLabel("One-time code").fill(env.GREENPIN_QA_OTP_A!);
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(
      page.getByRole("link", { name: "Register tree", exact: true }),
    ).toBeVisible();
  });
  const db = createClient(
    env.GREENPIN_QA_URL!,
    env.GREENPIN_QA_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const other = env.GREENPIN_QA_PHONE_B!;
  expect((await db.auth.signInWithOtp({ phone: other })).error).toBeNull();
  expect(
    (
      await db.auth.verifyOtp({
        phone: other,
        token: env.GREENPIN_QA_OTP_B!,
        type: "sms",
      })
    ).error,
  ).toBeNull();
  for (const table of ["trees", "tree_locations", "tree_photos"]) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq(table === "trees" ? "id" : "tree_id", id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  }
  const req = crypto.randomUUID();
  expect(
    (await db.rpc("gp_care", { t: id, e: req, op: "request" })).error,
  ).toBeNull();
  expect(
    (await db.rpc("gp_care", { t: id, e: req, op: "approved" })).error,
  ).toBeTruthy();
  await page.goto("/trees/" + id + "?tab=Caretaker");
  await page.getByRole("button", { name: "Approve request" }).click();
  await expect(
    page.getByRole("button", { name: "Release responsibility" }),
  ).toBeVisible();
  const { data, error } = await db
    .from("tree_photos")
    .select("storage_path")
    .eq("tree_id", id)
    .single();
  expect(error).toBeNull();
  const storage = db.storage.from("tree-photos");
  expect((await storage.download(data!.storage_path)).error).toBeNull();
  await page.getByRole("button", { name: "Release responsibility" }).click();
  await expect(page.getByText("No caretaker assigned.")).toBeVisible();
  expect((await storage.download(data!.storage_path)).error).toBeTruthy();
  await db.auth.signOut();
});
