// SPEC: ADR-0010 (host-reasoning stepped MCP tools) —
//       §"Pending-state shape".
//
// `.agora/mcp_pending.json` reader/writer + zod schema. The pending file
// is the one piece of disk state that bridges two MCP tool calls: when
// the orchestrator returns a `needs_user_input` / `needs_reasoning`
// envelope it also persists a pending record naming the step + the
// scratch context the next call needs to assemble the follow-up. The
// next call merges `user_answers` / `llm_responses` with the record,
// applies, and clears.
//
// LAYER 2 — depends on errors / result / shared.io.

import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import { err, ok, type Result } from "../result/index.js";
import { readJsonOrNull, writeJsonAtomic } from "../shared/io.js";
import { StepLoopSchema, StepPromptSchema, StepQuestionSchema } from "./step.js";

export const McpPendingExpectsSchema = z.enum(["user_answers", "llm_responses"]);
export type McpPendingExpects = z.infer<typeof McpPendingExpectsSchema>;

export const McpPendingSchema = z
  .object({
    version: z.literal(1),
    owner: StepLoopSchema,
    step: z.string().min(1),
    expects: McpPendingExpectsSchema,
    // What was asked of the host. Mutually exclusive per `expects`, but
    // we keep both as optional fields rather than a discriminated union —
    // it keeps callers tidy and the orchestrator already validates the
    // shape at apply time.
    issued_questions: z.array(StepQuestionSchema).optional(),
    issued_prompts: z.array(StepPromptSchema).optional(),
    // Step-specific intermediate state — e.g. for `telos.extract` this
    // carries the raw answers from the prior `telos.questions` step so
    // the LLM prompt can be (re-)built deterministically on the next
    // tool call.
    scratch: z.record(z.string(), z.unknown()),
    issued_at: z.string().datetime(),
  })
  .strict();
export type McpPending = z.infer<typeof McpPendingSchema>;

export function pendingPath(cwd: string): string {
  return join(cwd, ".agora", "mcp_pending.json");
}

export async function readPending(
  cwd: string,
): Promise<Result<McpPending | null, AgoraErrorThrown>> {
  const path = pendingPath(cwd);
  const raw = await readJsonOrNull<unknown>(path);
  if (raw === null) return ok(null);
  const parsed = McpPendingSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      buildAgoraError("state.corrupt", {
        context: {
          file: path,
          detail: parsed.error.issues[0]?.message ?? "mcp_pending.json validation failed",
        },
      }),
    );
  }
  return ok(parsed.data);
}

export async function writePending(cwd: string, pending: McpPending): Promise<void> {
  const validated = McpPendingSchema.parse(pending);
  await writeJsonAtomic(pendingPath(cwd), validated);
}

export async function clearPending(cwd: string): Promise<void> {
  try {
    await unlink(pendingPath(cwd));
  } catch {
    // ENOENT and friends: nothing to clear, that's fine.
  }
}
