import * as core from "@actions/core";
import * as glob from "@actions/glob";
import * as fs from "node:fs";

export interface ResolveFilesOptions {
  patterns: string[];
  ifNoFilesFound?: "warn" | "error" | "ignore";
  includeHiddenFiles?: boolean;
}

export interface ResolvedFiles {
  all: string[];
  files: string[];
}

export async function resolveFiles(
  options: ResolveFilesOptions,
): Promise<ResolvedFiles | null> {
  const {
    patterns,
    ifNoFilesFound = "warn",
    includeHiddenFiles = false,
  } = options;

  const globber = await glob.create(patterns.join("\n"), {
    implicitDescendants: true,
    matchDirectories: true,
    excludeHiddenFiles: !includeHiddenFiles,
  });

  const all = await globber.glob();

  if (all.length === 0) {
    const msg = `No files found matching:\n${patterns.join("\n")}`;
    if (ifNoFilesFound === "error") throw new Error(msg);
    if (ifNoFilesFound === "warn") core.warning(msg);
    return null;
  }

  const files = all.filter((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  return { all, files };
}