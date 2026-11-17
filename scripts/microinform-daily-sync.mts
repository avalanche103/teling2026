/**
 * Unattended Microinform price sync: fetch XLS → apply prices / delivery / hide absent.
 *
 * Usage: npm run microinform:sync
 */
import { runDailyMicroinformSync } from "../lib/microinform/daily-sync";

async function main() {
  const result = await runDailyMicroinformSync();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && !result.skipped) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
