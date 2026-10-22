import { execSync } from "node:child_process";

export default function setup() {
  execSync("npx tsx scripts/seed/index.ts", { stdio: "inherit" });
}
