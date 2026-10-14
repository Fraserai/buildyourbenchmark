import "./env";
import { getDb } from "../src/server/db/client";

getDb();
console.log("✓ migrations applied");
