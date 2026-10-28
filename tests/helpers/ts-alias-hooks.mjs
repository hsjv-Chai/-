// Node's built-in TypeScript stripping plus the project's server import aliases.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../../", import.meta.url);
export async function resolve(specifier, context, next) {
  let target = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), root).href
    : specifier;
  try {
    return await next(target, context);
  } catch (error) {
    if (target.startsWith(".") || target.startsWith("file:")) {
      const base = new URL(target, context.parentURL || root);
      for (const suffix of [".ts", ".mjs", "/index.ts"]) {
        const candidate = new URL(base.href + suffix);
        if (existsSync(fileURLToPath(candidate)))
          return next(candidate.href, context);
      }
    }
    throw error;
  }
}
