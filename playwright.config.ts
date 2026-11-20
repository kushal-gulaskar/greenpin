import { defineConfig } from "@playwright/test";
const local = "http://127.0.0.1:5174",
  contract = "http://127.0.0.1:5175";
export default defineConfig({
  testDir: "tests",
  testIgnore: "**/live/**",
  projects: [
    {
      name: "local",
      testMatch: /registry\.spec|sprint2\.spec/,
      use: { baseURL: local },
    },
    {
      name: "cloud-contract",
      testMatch: /cloud\.spec/,
      use: { baseURL: contract },
    },
  ],
  webServer: [
    {
      env: { VITE_DATA_SOURCE: "local" },
      command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
      url: local,
    },
    {
      env: {
        VITE_DATA_SOURCE: "supabase",
        VITE_SUPABASE_URL: "https://greenpin-test.invalid",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
      },
      command: "npm run dev -- --host 127.0.0.1 --port 5175 --strictPort",
      url: contract,
    },
  ],
});
