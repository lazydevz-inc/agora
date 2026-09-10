# Working with agents in Agora

Last reviewed: **2026-09-11** against the current repository and
[OpenAI's latest-model guide](https://developers.openai.com/api/docs/guides/latest-model)
(GPT-6 Astra at that date). The guide informs the working practices below;
Agora's product contracts remain defined by its accepted SPECs and ADRs.

## Start with the right context

Read [SESSION_HANDOFF.md](SESSION_HANDOFF.md) first, then the applicable
repository instructions and task references. Root `AGENTS.md` is a symlink
to [CLAUDE.md](../CLAUDE.md): edit that shared source rather than create a
second instruction set. Verify the working tree, relevant implementation,
accepted ADRs, and current stage before changing anything.

Separate two activities: an agent **developing Agora** can inspect, edit,
and verify an authorized change; a host **using Agora** must also honor the
Alignment and Ralph tool contracts described below.

## Carry an authorized development task through verification

- Treat a concrete change request as authorization for its ordinary local
  implementation. Briefly state scope and expected result, then proceed.
  Reuse existing decisions instead of asking Sang to approve them again.
- Resolve routine implementation details from the SPEC and code. Ask a
  focused question when an unresolved requirement changes the result;
  continue independent work while the answer is pending.
- Prepare a reviewable proposal for decisions reserved to Sang. Stage
  transitions still require explicit approval. Architectural changes need
  an ADR; new dependencies and a sixth philosopher need permission. Keep
  project isolation and the ban on runtime telemetry intact.
- Skills assist the request; the user's explicit instructions take
  precedence over skill guidelines. If a file causes a pause, link the
  exact file, quote the applicable instruction, and explain the unresolved
  decision. Do not invent an approval requirement from a recommendation.
- Preserve unrelated edits. Keep commit, push, publication, and external
  communication within the user's authorization; completion of an edit
  does not itself authorize those actions.
- Give short Korean progress updates with findings or remaining blockers.
  Report the result, evidence, and limitations plainly. Use English for
  repository technical documentation and code comments unless requested
  otherwise.

An example development request:

```text
Fix the reported agora status next-step guidance for the described state.
Read docs/SESSION_HANDOFF.md, the relevant CLI SPEC, and the implementation.
Reproduce the mismatch, reuse the existing routing pattern, and make the
smallest correction within the current stage. Delegate an independent
regression review if useful. Run pnpm verify and exercise the affected CLI
output. Report changed files and actual results. Do not commit or push.
```

## Delegate bounded work with clear ownership

Use available host subagents for independent SPEC audits, disjoint edits,
or a second review while the main agent advances other work. Assign a
concrete deliverable and enough context to evaluate it; a whole copy of
the parent task creates competing owners. The parent integrates findings,
checks evidence, resolves conflicts, and owns the final verification.

```text
Task: Review the status/resume guidance for the scenario below.
Context: <user-observed behavior, accepted decision, relevant SPEC anchors>.
Read: <specific implementation and test paths>.
Ownership: Read-only review. Do not edit files or call mutating Agora tools.
Return: Concrete mismatches with file/line evidence, expected behavior,
and the smallest regression scenario. Separate verified facts from hypotheses.
The parent is implementing the fix; do not duplicate that implementation.
```

For delegated edits, replace read-only ownership with an explicit file
allowlist. Parallelize independent reads; serialize dependent operations
and shared-file edits. Subagents are host workers, not additional Agora
philosopher modules or permission to alter Ralph's accepted scheduling.

## Drive the host-reasoning MCP loop faithfully

The maintained installation flow is [Claude Code](getting-started.md).
Codex can work on this repository using `AGENTS.md`; that alone does not
verify the full Agora product loop in Codex or another MCP client.
`agora doctor` still includes Claude-specific probes. Treat another
client's installation, tool exposure, and end-to-end behavior as unverified
until exercised in that environment.

Agora's MCP server uses stdio and operates in its process working directory.
Launch it for the intended project and keep that project binding stable.
Tools do not accept a `cwd`, `model`, or reasoning-effort argument. Use
`agora_status` / `agora_resume` and their `next[].mcp_tool` hints to inspect
an existing session. For a new session, use `agora_new`, then
`agora_intake` with the user's raw intent in `raw_text`, before alignment.

Follow each `agora_align_step` or `agora_ralph_step` response:

| `kind` | Host action |
|--------|-------------|
| `advanced` | Read the message, perform any indicated implementation work, then take the next step. |
| `needs_reasoning` | Answer the issued prompts using their current IDs, `expect`, and `schema_hint`; submit `llm_responses`. |
| `needs_user_input` | Relay the questions and wait for the user's actual answers; submit `user_answers` keyed by question ID. |
| `error` | Inspect the error and correct its cause before retrying. Do not label it a successful step. |
| `done` | Report completion of that loop and inspect the resulting phase before proceeding. |

Display every supplied `philosopher` and `purpose_label` alongside the
question. Z2 is a loop-policy decision and may have a purpose without a
philosopher; do not fabricate attribution. With `open_question: true`,
preserve the open examination, invite the user's own words, and label any
candidate answers as suggestions. Submit only what the user selected or
wrote. Never turn an agent's proposed answer into the user's reasoning or
use it to manufacture a maturity pass.

Development autonomy does not remove product input gates. Handoff seed
confirmation and Z2 re-alignment remain user decisions. Do not treat a
generic instruction to finish implementation as the missing answer to an
Alignment question.

**One coordinator writes each project's `.agora/` state.** Serialize calls
that advance a loop or modify its artifacts, including intake and session
creation. `.agora/mcp_pending.json` holds one pending exchange shared by
alignment and Ralph; atomic file writes do not provide a concurrent session
transaction. Helpers may review snapshots or draft reasoning, but the
coordinator validates and submits each response. Never copy another
project's seed, pending record, or answers into this project.

The wire contract lives in [server.ts](../src/mcp/server.ts),
[step.ts](../src/mcp/step.ts), and [pending.ts](../src/mcp/pending.ts).

## Keep continuity through corrections and context compaction

Apply user corrections to the active task and retain its remaining scope.
A status question does not cancel implementation. When compacting or
handing off, preserve the objective, accepted decisions, stage boundary,
changed files, verification results, outstanding work, and actual user
answers. For an active Agora session, retain the last envelope and pending
question/prompt IDs; re-read local state before submitting a continuation.
Do not replay an already applied mutation or guess an ID from an older step.

These are host operating practices. Agora has no OpenAI API runner or
OpenAI model configuration. Its standalone runtime currently selects the
Claude CLI; MCP steps receive reasoning from the host. OpenAI API features
such as async tools, mid-turn steering, and `configuration_update` are not
Agora flags or implemented Agora orchestration features. Keep the host's
configured model and effort unless the user requests a change; check that
host's supported settings before applying one.

## Verify the delivered change

For repository changes, run `pnpm verify` before declaring completion. The
current [package.json](../package.json) runs these six checks in order:

```text
lint → typecheck → lint:locale → lint:prompts → test → build
```

Also exercise the affected CLI behavior and relevant JSON/locale output.
Use a suitable TTY for interactive flows; report any unperformed check
explicitly. Add tests for real behavioral risk rather than duplicating a
prose edit or implementation detail. Once the required checks pass, repeat
or broaden them only for later changes, failures, or unresolved concerns.
Read the final diff and report verified outcomes without assuming that a
successful build proves an untested host integration.
