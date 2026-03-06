import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function splitSpecifier(specifier) {
  const match = specifier.match(/^([^?#]+)([?#].*)?$/);
  return {
    pathPart: match?.[1] ?? specifier,
    suffix: match?.[2] ?? "",
  };
}

function resolveExistingFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith("node:") ||
    specifier.startsWith("data:") ||
    specifier.startsWith("file:")
  ) {
    return nextResolve(specifier, context);
  }

  const { pathPart, suffix } = splitSpecifier(specifier);

  if (pathPart.startsWith("@/")) {
    const resolved = resolveExistingFile(
      path.resolve(process.cwd(), "src", pathPart.slice(2)),
    );
    if (resolved) {
      return {
        shortCircuit: true,
        url: `${pathToFileURL(resolved).href}${suffix}`,
      };
    }
  }

  if (
    (pathPart.startsWith("./") || pathPart.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const resolved = resolveExistingFile(path.resolve(parentDir, pathPart));
    if (resolved) {
      return {
        shortCircuit: true,
        url: `${pathToFileURL(resolved).href}${suffix}`,
      };
    }
  }

  return nextResolve(specifier, context);
}
