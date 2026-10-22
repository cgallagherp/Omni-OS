import { execSync } from "node:child_process";

/** Integration tests run against a freshly seeded local Supabase. */
export default function setup() {
  execSync("npx tsx scripts/seed/index.ts", { stdio: "inherit" });
}
