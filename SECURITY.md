# Security Policy

## Supported versions

Agora is in **alpha** (`0.0.x-alpha`). Security fixes land on `main` and the
latest published version only. There is no LTS branch yet.

## Agora's threat surface (what to keep in mind)

Agora is a **local developer tool**. By design:

- It runs on your machine, inside your Claude Code session or as a local CLI.
- **It makes no network calls of its own** in the primary (plugin) mode — your
  Claude Code session does the reasoning. In standalone CLI mode it shells out
  to your local `claude` binary.
- It reads and writes a `.agora/` directory in the project you run it on, and
  reads project files to detect stack/structure (Phase 0 scan).
- **It collects no telemetry** — no phone-home, no analytics. Crash reports, if
  any, are written locally to `~/.agora/crashes/` and never transmitted
  (MANIFESTO P6, ADR-0007).

The most relevant risks are therefore local: a malicious **Seed**, prompt, or
project file influencing what the host agent is asked to do, and the contents of
`.agora/` (which can encode your project's intent). Treat `.agora/seed.*` and
audit logs as you would any project doc.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

- Preferred: open a private
  [GitHub Security Advisory](https://github.com/lazydevz-inc/agora/security/advisories/new).
- Or email **sang@lazydevz.com** with `[agora security]` in the subject.

Include what you found, how to reproduce it, and the impact you see. We'll
acknowledge within a few days and keep you updated on the fix. Coordinated
disclosure is appreciated — we'll credit you unless you'd rather stay anonymous.

## Out of scope

- Issues that require the user to run an already-untrusted project or paste an
  already-untrusted Seed (Agora assumes you trust the repo you point it at).
- Vulnerabilities in `claude`, Node.js, or third-party dependencies — report
  those upstream (we'll bump once a fix is released).
