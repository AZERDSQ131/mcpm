import { copyFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(__dirname, "..", "packages", "registry", "registry.json");
const target = path.join(__dirname, "..", "packages", "cli", "registry.json");

copyFileSync(source, target);
console.log(`Synced ${path.relative(process.cwd(), source)} -> ${path.relative(process.cwd(), target)}`);
