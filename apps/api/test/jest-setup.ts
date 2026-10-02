import { config } from 'dotenv';
import { resolve } from 'path';

// Loads apps/api/.env.test before any test module (and therefore Prisma's
// datasource resolution) runs. Never points at the dev database — tests
// run against a dedicated schovexa_test database.
config({ path: resolve(__dirname, '../.env.test') });

// Tests act right after registering, with no mail server to verify an
// address through, so the "verified email before sensitive actions" gate is
// off by default here. security.e2e-spec.ts turns it on for its own checks.
process.env.REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION ?? 'false';
