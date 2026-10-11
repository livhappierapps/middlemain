import fs from "node:fs";
import path from "node:path";

/** Resolve the monorepo from a service cwd without source/bundle __dirname assumptions. */
export function workspaceRoot(): string {
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(root);
    if (parent === root) throw new Error("Workspace root was not found");
    root = parent;
  }
  return root;
}
