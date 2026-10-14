/**
 * One-time local setup: generates secrets into .env.local, creates the database,
 * and performs the first model catalogue refresh.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const ENV = ".env.local";
let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : fs.readFileSync(".env.example", "utf8");
const has = (k: string) => new RegExp(`^${k}=.+$`, "m").test(env);
for (const key of ["DATA_ENCRYPTION_KEY", "SIGNING_SECRET"]) {
  if (!has(key)) {
    const value = crypto.randomBytes(32).toString("base64");
    env = new RegExp(`^${key}=\\s*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=\\s*$`, "m"), `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`;
    console.log(`✓ generated ${key}`);
  }
}
fs.writeFileSync(ENV, env, { mode: 0o600 });

await import("./env");
const { getDb } = await import("../src/server/db/client");
getDb();
console.log("✓ database ready");

const { refreshCatalogue } = await import("../src/server/catalogue/refresh");
const res = await refreshCatalogue({ trigger: "setup" });
for (const s of res.sources) console.log(`${s.ok ? "✓" : "✗"} ${s.name}${s.ok ? "" : `: ${s.error}`}`);
console.log(`✓ catalogue: ${res.summary.newModels.length} new models, ${res.summary.priceChanges.length} pricing snapshots`);
