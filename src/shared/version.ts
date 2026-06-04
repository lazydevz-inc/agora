// SPEC: docs/architecture/module-graph.md (src/shared/) —
// Single source of the package version. Replaces the getAgoraVersion() /
// readPackageVersion() bodies that were copy-pasted across every cli/ command,
// cli/render.ts, and mcp/server.ts.

import { readFileSync } from "node:fs";

let cached: string | undefined;

/** The Agora package version (memoized). Returns "unknown" if unreadable. */
export function agoraVersion(): string {
  if (cached === undefined) {
    try {
      const url = new URL("../../package.json", import.meta.url);
      const parsed = JSON.parse(readFileSync(url, "utf8")) as { version?: string };
      cached = parsed.version ?? "unknown";
    } catch {
      cached = "unknown";
    }
  }
  return cached;
}
