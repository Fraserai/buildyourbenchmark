import "./env";
import { refreshCatalogue } from "../src/server/catalogue/refresh";

const res = await refreshCatalogue({ trigger: "cli" });
console.log(JSON.stringify(res, null, 2));
