import { defineConfig } from "@playwright/test";
const env = process.env;
for (const key of [
  "GREENPIN_QA_URL",
  "GREENPIN_QA_PUBLISHABLE_KEY",
  "GREENPIN_QA_PHONE_A",
  "GREENPIN_QA_OTP_A",
  "GREENPIN_QA_PHONE_B",
  "GREENPIN_QA_OTP_B",
]) {
  if (!env[key])
    throw Error("Dedicated test project configuration required: " + key);
}
if (env.GREENPIN_QA_PHONE_A === env.GREENPIN_QA_PHONE_B)
  throw Error("Use two distinct test identities.");
export default defineConfig({
  testDir: "tests/live",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:5176",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    env: {
      VITE_DATA_SOURCE: "supabase",
      VITE_SUPABASE_URL: env.GREENPIN_QA_URL!,
      VITE_SUPABASE_PUBLISHABLE_KEY: env.GREENPIN_QA_PUBLISHABLE_KEY!,
    },
    command: "npm run dev -- --host 127.0.0.1 --port 5176 --strictPort",
    url: "http://127.0.0.1:5176",
  },
});
