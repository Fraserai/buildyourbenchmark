import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.SIGNING_SECRET = crypto.randomBytes(32).toString("base64");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-test-"));
process.env.INFERENCE_PROVIDER_PRIORITY = "anthropic,openrouter";
process.env.CATALOGUE_REFRESH_HOURS = "0";
