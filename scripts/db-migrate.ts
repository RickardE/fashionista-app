import "./env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect } from "@/server/db/client";
import { createLogger } from "@/server/log";

const log = createLogger("db:migrate");

async function main() {
  const { db, close } = connect();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: "./drizzle" });
    log.info("migrations applied");
  } finally {
    await close();
  }
}

main().catch((err) => {
  log.error("migration failed", { error: err });
  process.exit(1);
});
