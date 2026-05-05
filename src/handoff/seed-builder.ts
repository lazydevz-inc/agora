// SPEC: docs/loops/handoff.md (Stage 2-C — handoff seed.json contract).
//
// Combines all .agora/*.json artifacts produced during alignment loop
// into a single lockable seed.json. defended_frame is OPTIONAL
// (greenfield projects skip Husserl Phase −1 OR users may have run
// `agora new` without `agora bracket`); intake / four_causes / acs /
// ac_tree are all REQUIRED (handoff refuses if any missing).
//
// Pure data combiner. No I/O (caller reads the source artifacts +
// writes seed.json). LAYER 2.

import { z } from "zod";
import { AcceptanceCriteriaResultSchema } from "../alignment/acceptance-criteria.js";
import { Phase1ResultSchema } from "../alignment/phase-1-intake.js";
import { FourCausesSchema } from "../philosophers/aristotle.js";
import { DefendedFrameSchema } from "../philosophers/husserl.js";
import { ACNodeSchema } from "./dihairesis.js";

export const SeedSchema = z
  .object({
    version: z.literal(1),
    locked_at: z.string().datetime(),
    defended_frame: DefendedFrameSchema.optional(),
    intake: Phase1ResultSchema,
    four_causes: FourCausesSchema,
    acceptance_criteria: AcceptanceCriteriaResultSchema,
    ac_tree: z.array(ACNodeSchema).min(1),
  })
  .strict();
export type Seed = z.infer<typeof SeedSchema>;

export interface SeedBuildInput {
  readonly defended_frame: z.input<typeof DefendedFrameSchema> | null;
  readonly intake: z.input<typeof Phase1ResultSchema>;
  readonly four_causes: z.input<typeof FourCausesSchema>;
  readonly acceptance_criteria: z.input<typeof AcceptanceCriteriaResultSchema>;
  readonly ac_tree: z.input<typeof ACNodeSchema>[];
}

export function buildSeed(input: SeedBuildInput): Seed {
  // Construct then Zod-validate to catch any cross-artifact inconsistencies
  // (e.g. malformed types from disk JSON).
  const candidate = {
    version: 1 as const,
    locked_at: new Date().toISOString(),
    ...(input.defended_frame !== null ? { defended_frame: input.defended_frame } : {}),
    intake: input.intake,
    four_causes: input.four_causes,
    acceptance_criteria: input.acceptance_criteria,
    ac_tree: input.ac_tree,
  };
  return SeedSchema.parse(candidate);
}
