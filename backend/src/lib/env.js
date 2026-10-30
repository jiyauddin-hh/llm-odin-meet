// Loads backend/.env (Node 20.12+ built-in, no dotenv needed).
import { existsSync } from "node:fs";

const file = new URL("../../.env", import.meta.url);
if (existsSync(file)) process.loadEnvFile(file);
