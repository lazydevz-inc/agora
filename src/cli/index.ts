#!/usr/bin/env node
/**
 * Agora CLI entry point.
 *
 * Stage 0 — placeholder. Real CLI lands in Stage 3.
 * See docs/architecture/decisions/0004-development-stages.md
 */

import { Command } from "commander";
import pc from "picocolors";

const VERSION = "0.0.1-alpha.0";

const program = new Command()
  .name("agora")
  .description("The marketplace where ancient philosophers harness modern agents.")
  .version(VERSION, "-v, --version", "print version and exit");

program
  .command("version")
  .description("print version")
  .action(() => {
    console.log(`agora ${VERSION}`);
  });

program.action(() => {
  const banner = `
${pc.cyan("◯")} ${pc.bold("Agora")} ${pc.dim(`v${VERSION}`)} ${pc.cyan("◯")}

${pc.dim("Stage 0 — Foundation. Real CLI lands in Stage 3.")}

Read ${pc.cyan("docs/philosophy/00-why-agora.md")} for the intent.
Read ${pc.cyan("docs/architecture/decisions/")} for our committed decisions.
`;
  console.log(banner);
});

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(pc.red("Error:"), error instanceof Error ? error.message : error);
  process.exit(1);
});
