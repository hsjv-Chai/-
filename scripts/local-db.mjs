import {openConnection,dataDir} from "../lib/node-storage.mjs";
import {copyFileSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
export const sqlQuote = (value) =>
  "'" + String(value).replaceAll("'", "''") + "'";
export function wrangler(args, options = {}) {
  if(process.env.MELON_STORAGE==='node') {
    if(args[0]==='d1') {const source=args.includes('--file')?readFileSync(args[args.indexOf('--file')+1],'utf8'):args[args.indexOf('--command')+1];if(args.includes('--json'))return JSON.stringify([{results:openConnection().prepare(source).all()}]);openConnection().exec(source);return '';}
    if(args[0]==='r2') {const key=args[3].split('/').pop();if(!/^[a-zA-Z0-9_-]+$/.test(key))throw new Error('Invalid key');const dir=join(dataDir(),'uploads');mkdirSync(dir,{recursive:true});if(args[2]==='put')copyFileSync(args[args.indexOf('--file')+1],join(dir,key));else if(args[2]==='delete'){try{unlinkSync(join(dir,key));}catch(e){if(e.code!=='ENOENT')throw e;}}return '';}
    throw new Error('Unsupported node test operation');
  }
  return execFileSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      ...args,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, ...options },
  );
}
export function sql(query, parse = false) {
  const out = wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--command",
    query,
    ...(parse ? ["--json"] : []),
  ]);
  if (!parse) return out;
  return JSON.parse(out).flatMap((x) => x.results || []);
}
export function migrate() {
  if (process.env.MELON_STORAGE!=="node" && !existsSync("dist/server/wrangler.json"))
    throw new Error("请先运行 npm run build");
  sql(
    "CREATE TABLE IF NOT EXISTS _melon_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    sql("SELECT name FROM _melon_migrations", true).map((r) => r.name),
  );
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  mkdirSync(".sites-runtime", { recursive: true });
  for (const migration of journal.entries) {
    if (applied.has(migration.tag)) continue;
    const source = readFileSync(`drizzle/${migration.tag}.sql`, "utf8");
    const temp = resolve(".sites-runtime/migration.sql");
    writeFileSync(
      temp,
      source +
        `;\nINSERT INTO _melon_migrations(name,applied_at) VALUES(${sqlQuote(migration.tag)},${Date.now()});`,
    );
    wrangler([
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      "--file",
      temp,
    ]);
    console.log("Applied:", migration.tag);
  }
  console.log("Local database is ready.");
}
if (process.argv[1] === resolve("scripts/local-db.mjs")) migrate();
