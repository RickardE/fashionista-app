// Loads env for CLI scripts the same way Next does: .env.local overrides .env.
// ENV_FILE points a script at another environment without touching .env.local,
// e.g. `ENV_FILE=.env.neon npm run db:migrate`. Variables already set in the
// shell always win.
import { existsSync } from "node:fs";
import { config } from "dotenv";

const file = process.env.ENV_FILE;
if (file && !existsSync(file)) throw new Error(`ENV_FILE ${file} does not exist`);
config({ path: file ? [file] : [".env.local", ".env"], quiet: true });
if (file) console.log(`[env] using ${file}`);
