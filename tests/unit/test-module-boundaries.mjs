import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import ts from "typescript";
const root = resolve(import.meta.dirname, "../..");
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(resolve(dir, e.name))
      : /\.[cm]?[jt]sx?$/.test(e.name)
        ? [resolve(dir, e.name)]
        : [],
  );
}
function dependencies(file) {
  const tree = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const result = [];
  for (const s of tree.statements) {
    if (
      !(ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) ||
      !s.moduleSpecifier
    )
      continue;
    if (s.isTypeOnly || s.importClause?.isTypeOnly) continue;
    const members = s.importClause?.namedBindings?.elements;
    if (
      members?.length &&
      !s.importClause.name &&
      members.every((e) => e.isTypeOnly)
    )
      continue;
    const spec = s.moduleSpecifier.text;
    if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
    const path = spec.startsWith("@/")
      ? resolve(root, spec.slice(2))
      : resolve(dirname(file), spec);
    const found = [
      path,
      ...[".ts", ".tsx", ".mts", ".mjs", "/index.ts", "/index.tsx"].map(
        (ext) => path + ext,
      ),
    ].find((p) => existsSync(p) && /\.[cm]?[jt]sx?$/.test(p));
    assert.ok(found, `${relative(root, file)}: unresolved ${spec}`);
    result.push(found);
  }
  return result;
}
test("client modules cannot reach storage or server handlers through runtime imports", () => {
  const visited = new Set();
  function walk(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const path = relative(root, file).replaceAll("\\", "/");
    assert.ok(
      !/^lib\/(server\.ts|community\/|museum\/(?:admin|public|store|images)\.ts|email\/(?:provider|service)\.ts|storage-|node-storage\.mjs|(?:games|garden)\/api\.ts)/.test(
        path,
      ),
      `client reaches ${path}`,
    );
    assert.ok(
      !/from\s+["'](?:node:sqlite|cloudflare:workers)["']/.test(
        readFileSync(file, "utf8"),
      ),
      `client imports storage in ${path}`,
    );
    dependencies(file).forEach(walk);
  }
  for (const file of files(resolve(root, "components/community"))) walk(file);
  walk(resolve(root, "components/card-room.tsx"));
  walk(resolve(root, "components/garden.tsx"));
  for (const file of files(resolve(root, "components/museum"))) walk(file);
});
test("community dependency graph has no cycles", () => {
  const done = new Set(),
    stack = [];
  function walk(file) {
    assert.ok(
      !stack.includes(file),
      "Import cycle: " +
        [...stack, file].map((p) => relative(root, p)).join(" -> "),
    );
    if (done.has(file)) return;
    stack.push(file);
    dependencies(file).forEach(walk);
    stack.pop();
    done.add(file);
  }
  for (const dir of ["components/community", "components/museum", "lib/community", "lib/museum"])
    for (const file of files(resolve(root, dir))) walk(file);
});
