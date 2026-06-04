---
name: Bug report
about: Something in Agora behaves differently from how it's documented
title: "bug: "
labels: bug
---

> Reminder: *"이 문서와 다른 것은 버그입니다."* If behavior diverges from the SPEC
> or README, that's a bug — please cite the doc it diverges from.

**What happened**

<!-- The actual behavior, with the exact command you ran. -->

```
$ agora <command>
<output>
```

**What you expected**

<!-- And the SPEC/README line that says so, if you have it. -->

**Environment**

- Agora version (`agora --version`):
- How you run it (Claude Code plugin / `claude mcp add` / standalone CLI):
- Node version (`node -v`):
- OS:

**`agora doctor` output** (if relevant)

```
$ agora doctor
```

**Audit log** (if a loop got stuck — `agora trace` is read-only and local)

```
$ agora trace --limit 20
```
