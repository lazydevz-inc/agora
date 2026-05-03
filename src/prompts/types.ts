// SPEC: docs/architecture/prompt-library.md (Stage 5-A.4)
//
// Skeleton — full PromptEntry Zod schema lands when prompt library
// generator (scripts/gen-prompts.ts) is implemented in Stage 6.
//
// This file exists to reserve the import path `@/prompts/types` for
// downstream slices.

export interface PromptEntryStub {
  // Full PromptEntry shape (Zod-validated) lands in next slice.
  readonly placeholder: true;
}
