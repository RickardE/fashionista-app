/**
 * Imports products from a configured source into the catalog.
 *
 *   npm run products:import                         # all sources, full sync
 *   npm run products:import -- --limit 500          # first 500 product groups (subset run)
 *   npm run products:import -- --file feed.xml      # from a local file
 *   npm run products:import -- --source adtraction:johnells --force
 */

import "./env";
import { parseArgs } from "node:util";
import { importFromSource } from "@/server/catalog/ingest";
import { getSource, listSourceKeys } from "@/server/catalog/sources/registry";
import { connect } from "@/server/db/client";
import { createLogger } from "@/server/log";

const log = createLogger("products:import");

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string", multiple: true },
      file: { type: "string" },
      limit: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });

  const sourceKeys = values.source?.length ? values.source : listSourceKeys();
  if (values.file && sourceKeys.length !== 1) {
    throw new Error("--file requires exactly one --source");
  }
  const limitGroups = values.limit ? Number(values.limit) : undefined;
  if (limitGroups !== undefined && (!Number.isInteger(limitGroups) || limitGroups <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  const { db, close } = connect();
  let failed = false;
  try {
    for (const key of sourceKeys) {
      try {
        const result = await importFromSource(db, getSource(key), {
          filePath: values.file,
          limitGroups,
          force: values.force,
        });
        console.log(`\n${key} — run #${result.runId}: ${result.status}`);
        console.table(result.stats);
        if (result.status === "partial") failed = true;
      } catch (err) {
        failed = true;
        log.error("source import failed", { source: key, error: err as Error });
      }
    }
  } finally {
    await close();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  log.error("import aborted", { error: err as Error });
  process.exit(1);
});
