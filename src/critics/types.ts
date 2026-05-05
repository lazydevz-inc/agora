// SPEC: docs/loops/ralph-loop.md Stage 2-B.3 (10 critics — 4 UI + 5 Tech
//       + 1 Universal; trigger-based selection) + docs/architecture/
//       prompt-library.md Stage 5-A.4 R3-A (each critic file at
//       src/critics/definitions/<id>.ts exports `prompt` const).
//
// LAYER 1. Schema for critic definitions + trigger model. Each critic
// def file declares: id / name / namespace ("ui" | "tech" | "universal")
// / trigger (when this critic fires) / prompt (system + user_template
// + placeholders for the prompt-library generator to consume).

import { z } from "zod";

// ─── Trigger model ───
//
// Per Stage 2-B.3 R2-A: critics fire only when their trigger matches
// the current Ralph context. `always` is the most permissive; future
// triggers (ac_field / file_pattern / tech_stack) refine further.
// Each trigger is a discriminated union with at most ONE active key
// (parser uses Zod refinement to enforce).

export const CriticTriggerSchema = z
  .object({
    always: z.literal(true).optional(),
    ac_field: z.array(z.string().min(1)).optional(),
    file_pattern: z.array(z.string().min(1)).optional(),
    tech_stack: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (t) => {
      const keys = [
        t.always !== undefined,
        t.ac_field !== undefined,
        t.file_pattern !== undefined,
        t.tech_stack !== undefined,
      ];
      const active = keys.filter(Boolean).length;
      return active === 1;
    },
    { message: "trigger must have exactly one active discriminator" },
  );
export type CriticTrigger = z.infer<typeof CriticTriggerSchema>;

// ─── Critic prompt shape ───
//
// Mirror of PromptEntry's prompt fields. Generator copies these into
// PROMPT_LIBRARY at namespace="critic" / key=`critic:<id>`.

export const CriticPromptSchema = z.object({
  system: z.string().min(1),
  user_template: z.string().min(1),
  placeholders: z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)),
});
export type CriticPrompt = z.infer<typeof CriticPromptSchema>;

// ─── Critic definition ───

export const CriticNamespaceSchema = z.enum(["ui", "tech", "universal"]);
export type CriticNamespace = z.infer<typeof CriticNamespaceSchema>;

export const CriticDefSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case"),
    name: z.string().min(1),
    namespace: CriticNamespaceSchema,
    trigger: CriticTriggerSchema,
    prompt: CriticPromptSchema,
  })
  .strict();
export type CriticDef = z.infer<typeof CriticDefSchema>;

// ─── Selection context (Aquinas Disputatio passes this in) ───

export interface CriticContext {
  readonly leaf_content?: string;
  readonly ac_fields_present?: readonly string[]; // e.g. ["telos.statement", "form.essential_structure"]
  readonly changed_files?: readonly string[];
  readonly tech_stack?: readonly string[];
  /** Optional namespace gate: only return critics matching this namespace. */
  readonly namespace_filter?: CriticNamespace;
}
