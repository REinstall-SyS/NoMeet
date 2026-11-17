import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const env = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(env)) loadEnvFile(env);
process.env.NEXT_TELEMETRY_DISABLED ??= "1";
const require = createRequire(import.meta.url);
process.argv[1] = require.resolve("next/dist/bin/next");
require(process.argv[1]);
