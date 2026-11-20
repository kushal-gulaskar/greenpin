# GreenPin · nature-ecosystem

GreenPin registers trees in India and tracks their caretakers, growth, maintenance and health. Sprint 3 adds a Supabase workspace with phone sign-in. The cloud workspace is the default. The original IndexedDB workspace remains available in development.

## Run locally

Use Node.js 26 and npm. From this directory:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173. On macOS/Linux use `npm` and `cp`. Fill in the project URL and publishable key before starting cloud mode. If you already have an environment file, edit it in place. To work entirely in the existing development demo, set `VITE_DATA_SOURCE=local` in that file. Restart Vite after configuration changes. Production builds use Supabase. The same browser, profile and origin (including port) are needed to find your previous local records.

## Workflows

Register a tree with a photograph and browser GPS or manual coordinates. Open a tree’s Growth, Maintenance, Caretaker or History section to maintain its record. To request access to someone else's private tree, obtain its Tree ID and enter it under My profile. The registrant reviews the request under Caretaker. A release ends access and retains the assignment history.

Open **My profile → Import local records** to export a backup, preview counts and confirm an account-specific import. Photos and registrations remain in IndexedDB.

## Setup and verification

- [Supabase setup](docs/supabase-setup.md)
- [Authentication and SMS](docs/authentication.md)
- [Architecture and database schema](docs/database-schema.md)
- [RLS and private Storage](docs/rls-policies.md)
- [Import and recovery](docs/data-migration.md)
- [Automated and hosted verification](docs/security-testing.md)

```sh
npx playwright install chromium --only-shell
npm run typecheck
npm test
npm run build
```

## Map and appearance

Explore defaults to a local location list. Set an authorized HTTPS MapLibre style in `VITE_MAP_STYLE_URL` to enable the consent-gated map. Use a provider whose attribution and usage terms permit your traffic. Map requests can reveal the viewing area. `VITE_APP_NAME` configures the display name, which defaults to GreenPin. The local demo includes four sample records with locally bundled [forest](https://images.unsplash.com/photo-1448375240586-882707db888b), [canopy](https://images.unsplash.com/photo-1441974231531-c6227db76b6e) and [sunlight](https://images.unsplash.com/photo-1518495973542-4542c06a5843) photographs.
