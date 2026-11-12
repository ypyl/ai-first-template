---
name: threat-model
description: "Run a short threat model before an L2 or L3 change that adds a service, a dependency, a data store, a permission model, or an external integration."
---

# Threat Model

One page, before the design is fixed. The point is to find the threat that makes
the design wrong, not to produce a security document.

Use at L2 and L3. For a security-sensitive L1 change, use the checklist in
`review-change` instead.

## 1. Draw the flow

List, in order:

- entry points: who can call what
- trust boundaries: where data changes hands
- stores: what is written, where, for how long
- external calls: services, queues, model providers
- the assets worth taking: data, credentials, money, compute, reputation

## 2. Ask STRIDE at each boundary

| Threat | Ask |
|---|---|
| Spoofing | Can someone claim another identity here? |
| Tampering | Can data be changed in transit or at rest? |
| Repudiation | Can an action happen with no record of who did it? |
| Information disclosure | Can data leak through an error, a log, a response, or timing? |
| Denial of service | What is unbounded, expensive, or retried without a limit? |
| Elevation of privilege | Can a caller gain a permission it was not granted? |

Add the agent-specific ones when a model or tool is in the flow:

- prompt injection through retrieved content or tool output
- a tool with more permission than the task needs
- model output used as code, a path, a query, or a command
- a third-party skill or connector that can read or write more than it needs

## 3. Write `threat-model.md`

Put it in the change folder. Keep it short:

```markdown
# Threat model

## Assets
## Entry points and trust boundaries
## Threats

| # | Threat | Path | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|

## Accepted risks

| Risk | Why accepted | Who accepted | Revisit when |
|---|---|---|---|
```

Likelihood and impact are Low, Medium, or High. A row with no mitigation is
either accepted, with a name and a trigger, or it blocks the design.

## 4. Feed the result

- A mitigation that changes behavior goes into the delta spec.
- A mitigation that changes architecture goes into the ADR.
- An accepted risk goes into `design.md` and, for L3, the evidence.
- A new control gets a test, or the threat model says why it cannot.

## Rules

- Threat modeling is not a code review. Do not read every file.
- No threat without a path: name the entry point and the asset.
- No invented framework numbers. If you cannot name the exact control, describe
  the risk and the mitigation in plain words.
- A model or a scanned document is not authoritative. Verify against the code.
