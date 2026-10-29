/**
 * Omni OS agent worker.
 *
 *   npm run agents:worker            # long-running: a tick every AGENT_TICK_SECONDS (default 30)
 *   npm run agents:tick              # one tick and exit (for cron / scheduled jobs)
 *
 * Runs independently of any browser or Claude session. State lives in Postgres
 * (agent_runs, agent_investigations, agent_events), so the worker can be stopped,
 * restarted or replaced at any time: runs resume from their last saved step.
 */
import { hostname } from "node:os";
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { tick } from "../../src/lib/agents/engine";
import { serviceClient } from "../../src/lib/agents/principal";

const once = process.argv.includes("--once");
const quiet = process.argv.includes("--quiet");
const interval = Number(process.env.AGENT_TICK_SECONDS ?? 30) * 1000;
const workerId = `${hostname()}:${process.pid}`;
const admin = serviceClient();
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; console.log(`\n${sig}: finishing the current tick…`); });

const MAX_RUNS = 10;

async function one() {
  // A full claim means more runs are due: keep going (bounded) so one pass covers everything due now.
  for (let pass = 0; pass < 8 && !stopping; pass++) {
    const started = Date.now();
    const r = await tick({ admin, workerId, maxRuns: MAX_RUNS, log: quiet ? undefined : (m) => console.log(`  ${m}`) });
    if (!quiet || r.runs || r.opened || r.errors.length)
      console.log(`[${new Date().toISOString()}] tick: ${r.signals} signals · ${r.opened} opened · ${r.runs} runs · ${r.steps} steps · ${r.errors.length} errors (${Date.now() - started} ms)`);
    for (const e of r.errors) console.error(`  ! ${e}`);
    if (r.runs < MAX_RUNS) break;
  }
}

async function main() {
  if (once) {
    await one();
    process.exit(0);
  }
  console.log(`Omni OS agent worker ${workerId} — tick every ${interval / 1000}s`);
  while (!stopping) {
    try {
      await one();
    } catch (e) {
      console.error("tick failed:", e);
    }
    for (let t = 0; t < interval && !stopping; t += 500) await new Promise((r) => setTimeout(r, 500));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
