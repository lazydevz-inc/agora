# ADR-0011 — Public Release and License Confirmation

> **Status**: Accepted (2026-06-04 — flips visibility to public + confirms MIT, the license ADR-0007 deferred)
> **Date**: 2026-06-02 (accepted 2026-06-04)
> **Decided by**: Sang Rhee
> **Discussed with**: Claude

## Context

ADR-0002 originally set visibility to "private indefinitely." ADR-0007 then
withdrew any scheduled public release and made going public an explicit,
trigger-based decision. ADR-0007 named the trigger precisely:

> *The license is re-evaluated if and only if … Sang decides to make the repo
> public (for any reason).*

ADR-0007 also deferred the strategic license choice (MIT vs BSL vs Apache-2.0
vs AGPLv3 vs dual) until two things were true at once: **real product IP exists**
and **public release is on the table**. Its explicit warning:

> *Make the license strategic before substantial valuable IP lands, IF
> public-release is on the table.*

Both conditions are now true:

1. **Intent to go public.** Sang intends to open-source Agora and announce it.
2. **Real IP has landed.** Stage 6 has shipped 34 vertical slices (~19.6k LOC of
   implementation): the alignment loop end-to-end (Husserl → Aristotle 4 causes →
   Socrates → Plato maturity + Dihairesis → AC capture → Seed lock), the Ralph
   loop (Gates 1–5 incl. Aquinas Disputatio and drift-score), and the
   host-reasoning MCP plugin layer (ADR-0009/0010).

Per ADR-0003 (meta-dogfooding) and the CLAUDE.md rule *"ADR 없이 architectural
change 금지"*, the visibility flip and the license confirmation must be recorded
as a deliberate decision, not an implicit drift.

## Decision

### 1. Visibility → Public

`lazydevz-inc/agora` will be made public. This supersedes the visibility
commitment in ADR-0002 (as amended by ADR-0007).

### 2. License → MIT, confirmed for the public v1 core

The provisional status of the MIT license (ADR-0007) is **lifted for the
open-source v1 scope**. Rationale:

- **Adoption-first thesis.** Agora's north-star is to become the alignment layer
  every AI-coding developer reaches for — *"the distro on the kernel."*
  Permissive MIT maximizes adoption and integration, consistent with the
  manifesto's *"bet on AI progress, not against it."*
- **Clean lineage.** Agora borrows *concepts* (not code) from Ouroboros
  (MIT, © 2025 Q00). `LICENSE` + `CREDITS.md` preserve Q00 attribution. MIT keeps
  the lineage litigation-free.
- **Optionality preserved correctly.** ADR-0007's own logic holds: MIT → stricter
  is hard, but the right moment to consider BSL/dual is at a **commercialization**
  decision, not the **public-release** decision. Going public under MIT does not
  foreclose a future commercial offering (open-core / hosted / paid CLI) whose
  *new* components carry a separate license.

> **This is the one genuinely strategic call in this ADR.** Confirmed by Sang
> (2026-06-04): the public v1 core ships under **MIT**. The alternatives
> (BSL / Apache-2.0 / AGPLv3 / dual) remain available for any future commercial
> component — see the table below.

### 3. Public-release audit gate

ADR-0002 Consequences require an audit pass before going public:
*"no secrets, license clean, README complete."* Status at this ADR (2026-06-02):

| Gate item | Status |
|-----------|--------|
| Secrets — tracked files | ✅ clean (scanned 2026-06-02) |
| Secrets — full git history (114 commits) | ✅ clean; no `.env` ever committed |
| License + attribution | ✅ MIT + Q00 attribution preserved (`LICENSE`, `CREDITS.md`) |
| README complete + honest | ✅ "Status" table verified claim-by-claim against code |
| OSS meta (CONTRIBUTING / SECURITY / CoC / CHANGELOG / issue+PR templates) | ✅ added with this ADR |
| CI (PR gate on `pnpm verify`) | ✅ added with this ADR |
| Onboarding (plugin manifest + install/usage guide) | ✅ added with this ADR |
| **Sang confirms license (§2)** | ✅ MIT confirmed (2026-06-04) |
| npm publish of `@lazydevz/agora` | ⏳ ready (`prepublishOnly` guard in place) |
| Final maintainer review of README claims | ⏳ maintainer sign-off |

## Consequences

### Positive
- The repo's stated governance now matches Sang's intent; announcement is unblocked.
- Records the license confirmation ADR-0007 explicitly demanded at this trigger.
- The audit gate is satisfied and auditable (table above).

### Negative / Trade-offs
- MIT means immediate forkability on publish. Mitigation: the
  commercialization-time re-evaluation path (a future ADR) remains open for any
  new commercial component.
- Once public, existing commits are permanently MIT (true of any open license).

### Neutral
- The `LICENSE` file text does not change.

## Alternatives Considered (license)

| Alternative | Why not now |
|-------------|-------------|
| **BSL** (source-available, time-delayed convert) | Defer to a commercialization decision with a real competitor profile + window. Premature for the v1 core. |
| **Apache-2.0** (MIT + explicit patent grant) | Marginal benefit over MIT; MIT is simpler and matches the Ouroboros lineage. |
| **AGPLv3** (strong copyleft) | Copyleft is adoption-hostile for a developer tool and contrary to the distro thesis. |
| **Dual (MIT + commercial)** | CLA + commercial-licensing overhead for zero current benefit; revisit at commercialization. |

## Supersedes

- **ADR-0002** visibility (as amended by ADR-0007): *private indefinitely* → **public**.
- **ADR-0007** license status: *provisional* → **confirmed (MIT) for the public v1 core**.

## References

- ADR-0002 (Project Location and Visibility)
- ADR-0003 (Meta Dogfooding)
- ADR-0007 (License Choice: MIT Provisional, Public Release Deferred) — the trigger this ADR fulfills
- ADR-0009 / ADR-0010 (Claude Code plugin / host-reasoning MCP tools) — the IP that now exists
- `LICENSE`, `CREDITS.md`, `README.md` "Status"
