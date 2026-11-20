# Verify Sprint 3

Run npm ci, npx playwright install chromium --only-shell, npm run typecheck, npm test and npm run build. Each test uses an ephemeral database or isolated browser context.

- **Database integration** executes both migrations inside PGlite PostgreSQL with PostGIS. A fixture supplies the Supabase-managed auth and storage schemas. Two UUID identities execute as the authenticated SQL role. Assertions cover private coordinates and photo object rows, owner-only edits, blocked impersonation, catalog and audit permissions, adoption review, active assignment, revocation, growth constraints and idempotent persistence.
- **Local browser regression** covers the original six Sprint 1 and 2 tests.
- **Cloud SDK contract tests** exercise the actual JavaScript client against intercepted test endpoints. They cover protected pages, phone validation, code errors, session persistence, logout, a registration-to-maintenance journey, backup, import failure/retry, image verification and duplicate prevention. The fixture has no external connectivity.
- **Hosted acceptance** exercises real Auth, PostgreSQL and Storage in a dedicated project. Configure the database and two test phone identities first. Supply the following variables to the test process through your development secret manager or private shell environment. The QA phone and OTP variables must stay outside the Vite namespace.

| Variable | Value |
| --- | --- |
| GREENPIN_QA_URL | Dedicated development project URL |
| GREENPIN_QA_PUBLISHABLE_KEY | That project's browser publishable key |
| GREENPIN_QA_PHONE_A, GREENPIN_QA_PHONE_B | Two distinct E.164 test phones |
| GREENPIN_QA_OTP_A, GREENPIN_QA_OTP_B | Matching server-configured test codes |

Run npm run test:live. It starts a separate local server on port 5176, creates a uniquely named QA tree, uploads a photo, records growth and maintenance, and signs out and back in. The second identity requests caretaking. The suite checks private reads before approval, photo download after approval, and revocation on release. It retains the isolated test records for inspection. Use only a dedicated test project. Hosted acceptance and real SMS delivery are separate verification steps.
