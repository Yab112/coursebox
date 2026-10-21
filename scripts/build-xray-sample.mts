/**
 * Writes the landing page's sample X-ray: the real analyzer run on the MIT 6.006 metadata fixture.
 * Re-run after changing the analyzers:  npx tsx scripts/build-xray-sample.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyzers } from "../lib/analyzers";
import { buildXray } from "../lib/xray";
import { loadFixture } from "../tests/load-fixture";

const f = loadFixture("ocw-6006");
const { manifest, analyzer } = await f.analyze();
// The fixture's files.txt lists a few files twice; a real zip has each path once.
const files = [...new Set(f.files)];
const xray = buildXray("6.006-spring-2020", analyzer, files, manifest, analyzers.find((a) => a.name === analyzer)?.isAsset);

const out = path.join(import.meta.dirname, "../public/samples/mit-6006.xray.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(xray) + "\n");
console.log(`wrote ${path.relative(process.cwd(), out)}: ${xray.stats.files} files, ${xray.stats.sections} sections, ${xray.stats.lessons} lessons`);
