// SPEC: docs/philosophers/runbooks/husserl.md (Stage 5-A.3 Rev 2) +
//       docs/philosophy/01-husserl-epoche.md (Stage 1).
//
// First philosopher implementation. Husserl Phase −1 Epoché — bracket
// the user's solution-frame BEFORE alignment loop proper begins.
//
// Simplification vs runbook §3.2: instead of multi-turn LLM dialogue,
// we make ONE LLM call to construct the 3 bracket alternatives, then
// orchestrate user dialogue locally (cheaper + faster + cache-friendly).
// Future iteration may move to runbook's full multi-turn pattern when
// concrete usage shows it adds value over this single-shot pattern.
//
// PROMPT INLINE: Stage 5-A.4 prompt-library generator not yet implemented.
// When it lands, this file's HUSSERL_* constants get replaced by calls to
// renderPrompt("husserl:phase-minus-1-bracket", ctx).

import { z } from "zod";

import type { Phase0Output } from "../alignment/phase-0-scan.js";
import { buildAgoraError } from "../errors/build.js";
import type { AgoraErrorThrown } from "../errors/types.js";
import type { ClaudeRunner } from "../llm/runner.js";
import { err, ok, type Result } from "../result/index.js";

// ─── Types ───

export const BracketDefenseSchema = z.object({
  considered_alternative: z.string(),
  defense: z.string(),
  defense_followup_triggered: z.boolean().default(false),
});
export type BracketDefense = z.infer<typeof BracketDefenseSchema>;

export const DefendedFrameSchema = z.object({
  raw_intent: z.string(),
  raw_experience: z.string().optional(),
  chosen_form: z.string(),
  brackets_considered: z.object({
    software_bracket: BracketDefenseSchema,
    form_bracket: BracketDefenseSchema,
    audience_bracket: BracketDefenseSchema,
  }),
  surprising_findings: z.array(z.string()).default([]),
  invocation: z.enum(["auto", "explicit_bracket"]),
  created_at: z.string().datetime(),
});
export type DefendedFrame = z.infer<typeof DefendedFrameSchema>;

export interface HusserlInput {
  readonly raw_intent: string;
  readonly raw_experience?: string;
  readonly cwd_signal: Phase0Output;
  readonly invocation: "auto" | "explicit_bracket";
  readonly locale: "en" | "ko";
}

export interface BracketAlternatives {
  software_alternative: string;
  form_alternative: string;
  audience_alternative: string;
}

/**
 * UI adapter — injected so tests can drive deterministic dialogue without
 * hitting @clack/prompts. Production caller wires up real prompts.
 */
export interface HusserlUi {
  askDefense(args: {
    bracketLabel: string;
    alternative: string;
    questionText: string;
  }): Promise<string>;
  askFollowupOnShortDefense(args: { bracketLabel: string; defense: string }): Promise<string>;
  askSurprisingFindings(): Promise<string>;
}

// ─── Inline prompt (replace with prompt-library lookup in future slice) ───

const HUSSERL_SYSTEM = `You are Husserl conducting Phase −1 Epoché for an Agora alignment loop.
Your sole task: construct THREE concrete alternatives that the user must defend
against. You are NOT proposing a solution. You are NOT evaluating. You construct
specific, named alternatives so the user can articulate why they reject them.

For each bracket, name ONE concrete alternative. Avoid "consider other options"
abstractions — name a specific thing. Examples of good alternatives:
  Software bracket: "physical notebook + index cards" / "weekly review meeting"
  Form bracket:    "private Discord channel" / "shared Notion page"
  Audience bracket: "your past self" / "small group of accountability buddies"

Return EXACTLY this JSON shape, with no extra keys, no commentary outside JSON:
{
  "software_alternative": "<one concrete non-software alternative>",
  "form_alternative": "<one concrete different shape/form alternative>",
  "audience_alternative": "<one concrete different audience alternative>"
}`;

function buildUserPrompt(input: HusserlInput): string {
  const cwdSummary = summarizeCwdSignal(input.cwd_signal);
  const expLine =
    input.raw_experience !== undefined && input.raw_experience.length > 0
      ? `Underlying experience: "${input.raw_experience}"\n`
      : "";
  return `User raw intent: "${input.raw_intent}"
${expLine}Project context:
${cwdSummary}

Construct three concrete alternatives per the JSON shape above.`;
}

function summarizeCwdSignal(scan: Phase0Output): string {
  const lines: string[] = [];
  lines.push(`- type: ${scan.is_brownfield ? "brownfield" : "greenfield"}`);
  if (scan.detected_patterns.length > 0) {
    lines.push(`- patterns: ${scan.detected_patterns.slice(0, 5).join(", ")}`);
  }
  if (scan.detected_stack.length > 0) {
    lines.push(`- stack: ${scan.detected_stack.slice(0, 5).join(", ")}`);
  }
  return lines.join("\n");
}

// ─── Orchestrator ───

const SHORT_DEFENSE_THRESHOLD = 50;

export async function runHusserlPhaseMinusOne(
  input: HusserlInput,
  runner: ClaudeRunner,
  ui: HusserlUi,
): Promise<Result<DefendedFrame, AgoraErrorThrown>> {
  // 1. Single LLM call → 3 alternatives.
  const altResult = await callForAlternatives(input, runner);
  if (!altResult.ok) return altResult;
  const alts = altResult.value;

  // 2. Drive user dialogue per bracket.
  const software = await captureBracket(
    ui,
    "Software",
    alts.software_alternative,
    `Could "${alts.software_alternative}" serve this need without software?`,
  );
  const form = await captureBracket(
    ui,
    "Form",
    alts.form_alternative,
    `What if it took the shape of "${alts.form_alternative}" instead?`,
  );
  const audience = await captureBracket(
    ui,
    "Audience",
    alts.audience_alternative,
    `What if the audience were "${alts.audience_alternative}"?`,
  );

  // 3. Surprising findings.
  const surprisingRaw = await ui.askSurprisingFindings();
  const surprising_findings = surprisingRaw.trim().length > 0 ? [surprisingRaw.trim()] : [];

  // 4. Build DefendedFrame.
  const frame: DefendedFrame = {
    raw_intent: input.raw_intent,
    ...(input.raw_experience !== undefined ? { raw_experience: input.raw_experience } : {}),
    chosen_form: input.raw_intent, // initial = unchanged; user may have refined verbally
    brackets_considered: {
      software_bracket: software,
      form_bracket: form,
      audience_bracket: audience,
    },
    surprising_findings,
    invocation: input.invocation,
    created_at: new Date().toISOString(),
  };

  const validated = DefendedFrameSchema.safeParse(frame);
  if (!validated.success) {
    return err(
      buildAgoraError("internal.invariant-violation", {
        context: { detail: validated.error.issues[0]?.message ?? "frame validation failed" },
      }),
    );
  }
  return ok(validated.data);
}

async function callForAlternatives(
  input: HusserlInput,
  runner: ClaudeRunner,
): Promise<Result<BracketAlternatives, AgoraErrorThrown>> {
  const response = await runner.call({
    system: HUSSERL_SYSTEM,
    prompt: buildUserPrompt(input),
    format: "json",
    timeout_ms: 60_000,
  });
  if (!response.ok) {
    return err(
      buildAgoraError("llm.internal-error", {
        context: { detail: response.error?.detail ?? "no response" },
      }),
    );
  }
  const content = response.content;
  if (typeof content !== "object" || content === null) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: "Husserl prompt did not return a JSON object" },
      }),
    );
  }
  const parseResult = z
    .object({
      software_alternative: z.string().min(1),
      form_alternative: z.string().min(1),
      audience_alternative: z.string().min(1),
    })
    .safeParse(content);
  if (!parseResult.success) {
    return err(
      buildAgoraError("llm.invalid-response", {
        context: { detail: parseResult.error.issues[0]?.message ?? "alt schema parse failed" },
      }),
    );
  }
  return ok(parseResult.data);
}

async function captureBracket(
  ui: HusserlUi,
  label: string,
  alternative: string,
  questionText: string,
): Promise<BracketDefense> {
  const initialDefense = await ui.askDefense({ bracketLabel: label, alternative, questionText });
  const trimmed = initialDefense.trim();
  if (trimmed.length >= SHORT_DEFENSE_THRESHOLD) {
    return {
      considered_alternative: alternative,
      defense: trimmed,
      defense_followup_triggered: false,
    };
  }
  // F-Husserl-1 mitigation: ask one follow-up when defense is too short.
  const followup = await ui.askFollowupOnShortDefense({ bracketLabel: label, defense: trimmed });
  const merged = `${trimmed}${trimmed.length > 0 ? "\n\n" : ""}${followup.trim()}`;
  return {
    considered_alternative: alternative,
    defense: merged,
    defense_followup_triggered: true,
  };
}
