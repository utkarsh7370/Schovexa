import { config } from 'dotenv';
import { resolve } from 'path';

// Loads apps/api/.env.test before any test module (and therefore Prisma's
// datasource resolution) runs. Never points at the dev database — tests
// run against a dedicated schovexa_test database.
config({ path: resolve(__dirname, '../.env.test') });
