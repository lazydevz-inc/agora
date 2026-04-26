# ADR-0007 — License Choice: MIT (Provisional), Public Release Deferred

> **Status**: Accepted (partially supersedes ADR-0002 visibility commitment)
> **Date**: 2026-04-27
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

The `LICENSE` file was created as MIT during Stage 0 by inheriting Ouroboros's license without an explicit decision. Sang flagged this during Stage 1 close: *"우리 mit라이센스로 가기로 한거야?"*

Multiple license options exist for projects that may eventually be commercialized:

- **MIT** — most permissive; current state
- **Apache 2.0** — MIT-equivalent + explicit patent grant
- **BSL (Business Source License)** — source-available, blocks commercial competitors for N years (typically 4), then auto-converts to MIT/Apache. Used by Sentry, CockroachDB, HashiCorp.
- **AGPLv3** — strong copyleft; requires service operators to publish source
- **Dual licensing** — MIT for non-commercial + commercial license for commercial use
- **Source-available proprietary** — code visible but no rights granted

Each has different implications for "what happens if someone forks Agora and tries to compete commercially."

## Decision

**MIT remains. The license is provisional, not strategic.**

The license decision is **deferred** because:

1. **Agora is not currently a public project.** Per Sang's explicit statement: *"우선은 private repo로 두고 내가 쓸 용도로 만드는거야."* While the repo is private, the license attached to the code is operationally irrelevant.

2. **Most current code is placeholder.** Real product code lands in Stage 6+. Whatever IP is worth protecting will be created later, not in the current commits.

3. **There is no current commitment to ever go public.** ADR-0002 originally implied an automatic Stage 5 public release. That commitment is **withdrawn** (see "Supersedes" below). Public release is now an open option, not a scheduled event.

4. **MIT is the safest default for a future-undecided project.** Going from MIT to a more restrictive license is hard (existing commits stay MIT). Going from a restrictive license to MIT is trivial. Optionality favors MIT.

5. **A real strategic license decision requires a real strategic context.** Today there is no commercial plan, no contributors, no users beyond Sang. Choosing BSL or AGPLv3 today would be premature optimization.

### Trigger for re-evaluation

The license is re-evaluated **if and only if** one of the following becomes true:

- Sang decides to make the repo public (for any reason)
- Sang decides to commercialize Agora as a standalone product
- A second contributor wants to commit code (raises CLA / future-license clarity questions)
- A material legal change makes MIT unsuitable

Until then, the license stays MIT and this ADR remains the controlling decision.

### What does NOT trigger re-evaluation

- Time passing alone
- Reaching Stage 5 or any other Stage milestone
- Achieving daily-use status
- Hypothetical scenarios about future competitors

## Supersedes

This ADR partially supersedes **ADR-0002 (Project Location and Visibility)**, which committed to "made **public** at the start of Stage 5."

### What changes

- ADR-0002's Stage 5 public-release commitment is **withdrawn**.
- Visibility is now **"private until Sang explicitly decides otherwise"** — no scheduled transition.

### What stays the same from ADR-0002

- Repo location: `lazydevz-inc/agora`
- npm scope (when/if published): `@lazydevz/agora`
- License at this moment: MIT
- Local path: `/Users/sang/Developer/agora/`

ADR-0002 is updated in-place to reference this ADR rather than fully superseded, because most of its content remains accurate.

## Consequences

### Positive

- **Optionality preserved.** MIT now does not constrain future strategic moves.
- **Honest framing.** The project is what it is — Sang's personal tool. No premature commercial framing.
- **Re-evaluation trigger is concrete** (public decision OR commercial decision OR contributor join), not vague (Stage milestone).
- **Resolves the F7 violation** that occurred during the original LICENSE creation (single-option-without-comparison).

### Negative / Trade-offs

- **If the project goes public later with MIT**, anyone can fork it for commercial use immediately. Mitigation: the public-release decision itself will be the moment to consider switching to BSL or dual-license, with the full strategic context available.
- **MIT cannot be retroactively removed** from existing commits. If we ever switch to a stricter license, the pre-switch commits remain MIT-licensed forever and could be forked from those commits. Mitigation: this is true of any open license; the answer is to make the license strategic *before* substantial valuable IP lands (i.e., before Stage 6+ implementation begins, IF public-release is on the table).

### Neutral

- The `LICENSE` file content does not change. The change is in *how we frame the license*, not in the legal text.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Switch to BSL now | Premature; no strategic context yet to choose 4-year window or competitor profile |
| Switch to AGPLv3 now | Strong copyleft is unnecessary for a private personal tool |
| Source-available proprietary | Loses the option to easily go public later |
| Dual license now | Operational overhead (CLA, commercial licensing infra) for zero current benefit |
| Defer the entire decision (don't write this ADR) | Leaves the license as an unrecorded assumption — exactly the F7 problem we just fixed |

## References

- ADR-0002 (Project Location and Visibility) — the partially-superseded predecessor
- ADR-0003 (Meta Dogfooding) — captures why even unsexy decisions get ADRs
- `LICENSE` file — current MIT text, including Q00 attribution required by Ouroboros's MIT
- `CREDITS.md` — Q00 attribution per Ouroboros MIT terms
- Stage 1 interview where this surfaced — `docs/stage-1/notes.md`
