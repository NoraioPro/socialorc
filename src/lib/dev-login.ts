/**
 * Historical note: this module used to expose dev-only role login helpers
 * (`isDevRoleLoginEnabled`, `devRoleOptions`, `demoEmailFor`, etc.) so that
 * the login page could render one-click "sign in as Admin/Editor/..." buttons
 * backed by seeded demo accounts.
 *
 * That demo-login surface has been removed: it exposed real-looking
 * `demo-@socialorc.local` accounts and a credential path that the browser
 * could see, which is a leak risk on a staging or mis-configured production
 * build. There is no replacement; tests that need a role should create a
 * real user through the normal API and assign a role explicitly.
 *
 * If dev quick-login is reintroduced, gate it behind both an explicit
 * `ALLOW_DEV_ROLE_LOGIN=true` env var AND `NODE_ENV !== "production"`, and
 * never render the credentials in the client bundle.
 */
