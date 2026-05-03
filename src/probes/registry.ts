// SPEC: docs/infra/probes.md (Stage 4-A.4 R2-A) +
//       docs/loops/ralph-loop.md (Stage 2-B.1)
//
// Static probe registry. First slice (Stage 6-A.2) ships 5 probes covering
// the always-true Tier 1 (claude / node / pnpm) + the most common brownfield
// Tier 1 markers (git / gh). Remaining 14 probes land in Stage 6-A.3.

import { claudeProbe } from "./definitions/claude.js";
import { ghProbe } from "./definitions/gh.js";
import { gitProbe } from "./definitions/git.js";
import { nodeProbe } from "./definitions/node.js";
import { pnpmProbe } from "./definitions/pnpm.js";
import type { Probe } from "./types.js";

export const ALL_PROBES: readonly Probe[] = [claudeProbe, nodeProbe, pnpmProbe, gitProbe, ghProbe];

export function findProbe(id: string): Probe | undefined {
  return ALL_PROBES.find((p) => p.id === id);
}
