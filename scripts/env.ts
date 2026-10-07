// Loads env for CLI scripts the same way Next does: .env.local overrides .env.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
