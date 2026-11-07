// Draft a part mapping for ANY two part drawings, from geometry and colour alone.
//
//   npx tsx tools/suggest-map.ts source.svg target.svg [--id my-morph] > draft.json
//
// Output: { spec: <morph.json draft>, roles: [...], review: [...] }.
// A starting point, not an answer: read `review`, then rewrite the mappings by meaning
// (skills/morph-master/references/part-mapping.md).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseSvg } from "../packages/morph-engine/src/vector/svg";
import { suggestMapping } from "../packages/morph-engine/src/vector/suggest";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { id: { type: "string", default: "my-morph" } } });
if (positionals.length !== 2) throw new Error("Usage: npx tsx tools/suggest-map.ts source.svg target.svg [--id name]");
const [a, b] = positionals.map(file => {
  const doc = parseSvg(readFileSync(file, "utf8"));
  if (doc.issues.anonymous) console.error(file + ": " + doc.issues.anonymous + " shapes without ids are named anon-N; give them ids for a readable mapping.");
  return doc;
});
console.log(JSON.stringify(suggestMapping(a, b, values.id), null, 2));
