// SPEC: docs/architecture/prompt-library.md (Stage 5-A.4 R5-A + Library
//       Entry Schema sub-section).
//
// Zod schema for PROMPT_LIBRARY entries. The generator
// (scripts/gen-prompts.ts) emits src/prompts/_generated.ts with literal
// objects shaped per this schema; runtime treats the library as trusted
// data (no per-call validation cost). This file is the LAYER 0 type
// surface only.

import { z } from "zod";

export const PromptEntrySchema = z
  .object({
    namespace: z.enum(["philosopher", "critic"]),
    owner: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    runbook: z.string().optional(),
    runbook_revision: z.number().int().min(1).optional(),
    critic_def: z.string().optional(),
    system_prompt: z.string().min(1),
    user_prompt_template: z.string().min(1),
    placeholders: z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)),
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    used_by: z.array(z.string()),
  })
  .strict()
  .refine(
    (e) =>
      e.namespace === "philosopher"
        ? e.runbook !== undefined && e.runbook_revision !== undefined && e.critic_def === undefined
        : e.critic_def !== undefined && e.runbook === undefined && e.runbook_revision === undefined,
    { message: "namespace must match source-of-truth pointer fields" },
  );

export type PromptEntry = z.infer<typeof PromptEntrySchema>;
