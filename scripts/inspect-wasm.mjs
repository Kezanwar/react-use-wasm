#!/usr/bin/env node
/**
 * Lists a module's imports and exports. Stands in for `wasm-objdump -x`
 * so the check needs no wabt install.
 *
 * Usage: node scripts/inspect-wasm.mjs <file.wasm> [--expect-no-imports]
 *        node scripts/inspect-wasm.mjs <file.wasm> --allow-imports env.log
 */
import { readFile } from "node:fs/promises";
import { argv, exit } from "node:process";

const [, , file, ...flags] = argv;
if (!file) {
  console.error("usage: inspect-wasm.mjs <file.wasm> [--allow-imports a.b,c.d]");
  exit(2);
}

const allowIdx = flags.indexOf("--allow-imports");
const allowed = new Set(
  allowIdx === -1 ? [] : (flags[allowIdx + 1] ?? "").split(",").filter(Boolean)
);

const bytes = await readFile(file);
const mod = await WebAssembly.compile(bytes);
const imports = WebAssembly.Module.imports(mod);
const exports = WebAssembly.Module.exports(mod);

console.log(`${file}  (${bytes.length} bytes)`);
console.log("\nimports:");
if (imports.length === 0) console.log("  (none)");
for (const i of imports) console.log(`  ${i.module}.${i.name}  [${i.kind}]`);

console.log("\nexports:");
for (const e of exports) console.log(`  ${e.name}  [${e.kind}]`);

const unexpected = imports
  .map((i) => `${i.module}.${i.name}`)
  .filter((n) => !allowed.has(n));

if (unexpected.length) {
  console.error(`\nunexpected imports: ${unexpected.join(", ")}`);
  exit(1);
}
console.log("\nimports OK");
