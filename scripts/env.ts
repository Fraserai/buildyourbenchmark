import fs from "node:fs";
// Load .env.local / .env for CLI scripts (Next.js loads them itself for the web app).
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) process.loadEnvFile(f);
}
