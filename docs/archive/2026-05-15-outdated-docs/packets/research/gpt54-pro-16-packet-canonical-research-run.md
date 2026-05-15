# GPT-5.4 Pro Canonical Research Run For The 16-Packet Audit Archive

## Purpose

This file is the canonical operating guide for the **actual 16-packet audit archive** you now have.

The audit history evolved over time. That created:

- a protocol-only packet
- an early interim scorecard
- an early interim benchmark
- later authoritative scorecard and benchmark packets

This file resolves that confusion and tells you exactly what to send to GPT-5.4 Pro.

## The Core Rule

You now have a **16-packet archive**.

That archive is the authority.

But not every packet has the same evidentiary weight.

## Canonical Packet Classification

### Primary evidence packets

These are the packets GPT-5.4 Pro should treat as primary platform evidence:

1. `Packet 1` — platform cartography / structure
2. `Packet 2` — execution-model audit
3. `Packet 3` — bloat / spaghetti / merge candidates
4. `Packet 5` — broker, capability, runtime isolation
5. `Packet 6` — durability, concurrency, replay safety
6. `Packet 7` — scale and bottlenecks
7. `Packet 8` — frontend/mobile multi-tenant shell audit
8. `Packet 11` — data governance, schema, and retention truth
9. `Packet 12` — build, deployment, config, secrets, supply-chain
10. `Packet 13` — test coverage, observability, disaster recovery readiness
11. `Packet 16` — live environment, drift, and restore audit

### Authoritative synthesis packets

These are still important, but they are synthesis built on top of the evidence above:

12. `Packet 14` — final forensic scorecard
13. `Packet 15` — competitive reference benchmark

### Supplemental interim synthesis packets

These should be sent, but only as historical synthesis context:

14. `Packet 9` — earlier final scorecard snapshot
15. `Packet 10` — earlier benchmark snapshot

These are useful, but they are **subordinate** to packets 14 and 15.

### Protocol-only packet

16. `Packet 4` — operational note about subagent use

This is **not platform evidence**.
It is only a procedural note.

GPT-5.4 Pro must not treat it as a source of architecture or security truth.

## Precedence Rules

GPT-5.4 Pro must use this evidence precedence:

1. `Primary evidence packets`
2. `Authoritative synthesis packets`
3. `Supplemental interim synthesis packets`
4. `Protocol-only packet`

If packets conflict:

- primary evidence wins
- later authoritative synthesis wins over earlier interim synthesis
- protocol-only notes never win against evidence

## Recommended File Names

Put each packet into a separate `.md` file with these names:

1. `packet-01-platform-cartography.md`
2. `packet-02-execution-model-audit.md`
3. `packet-03-bloat-spaghetti-hunt.md`
4. `packet-04-protocol-note-subagent-usage.md`
5. `packet-05-broker-capability-runtime-isolation.md`
6. `packet-06-durability-concurrency-replay-safety.md`
7. `packet-07-scale-and-bottlenecks.md`
8. `packet-08-frontend-mobile-shell-audit.md`
9. `packet-09-interim-scorecard.md`
10. `packet-10-interim-benchmark.md`
11. `packet-11-data-governance-retention.md`
12. `packet-12-build-deploy-config-secrets.md`
13. `packet-13-test-observability-dr-readiness.md`
14. `packet-14-authoritative-final-scorecard.md`
15. `packet-15-authoritative-benchmark.md`
16. `packet-16-live-environment-drift-restore.md`

Each file should contain the **exact packet output** and nothing else.

## Exact First Prompt To Send To GPT-5.4 Pro

Paste this as the first message in a new GPT-5.4 Pro chat:

```text
You are acting as a hostile principal engineer, security researcher, SRE, enterprise platform auditor, systems architect, and technical editor.

I am about to send you a canonical 16-packet forensic audit archive.

Critical rules:

1. Preserve my packet numbering exactly as provided.
2. Do not renumber, merge, delete, collapse, or normalize the archive.
3. Not all packets have equal weight. Use this precedence order:
   - primary evidence packets
   - authoritative synthesis packets
   - supplemental interim synthesis packets
   - protocol-only packets
4. If packets conflict:
   - primary evidence wins
   - later authoritative synthesis wins over earlier interim synthesis
   - protocol-only notes never override evidence

Truth-discipline rules:

5. Treat every packet as evidence, not unquestionable truth.
6. Preserve these confidence classes exactly:
   - proven issues
   - strong suspicions
   - low-confidence concerns
7. Never upgrade a suspicion into a fact.
8. Never invent repository facts, deployment facts, mitigations, exploit chains, or architecture claims not grounded in the packets.
9. Distinguish these truth domains at all times:
   - repository truth
   - verified local-live truth
   - unverified cloud truth
   - unverified enterprise truth
10. Every major claim must cite packet number and file/line evidence exactly as given in the packets.
11. If evidence is insufficient, say insufficient.

Behavior rules:

12. Be adversarial, technical, precise, and unsentimental.
13. Do not produce marketing language.
14. Do not smooth over contradictions.
15. Do not collapse repository truth into live truth.
16. Do not collapse local-live truth into cloud or enterprise proof.
17. Do not write the final paper until I explicitly instruct you to do so.

Working protocol:

- I will send labeled packets one by one.
- Until I say SYNTHESIZE, reply only with:
  READY FOR NEXT PACKET
- Do not summarize early.
- Do not infer missing packets.

When I say SYNTHESIZE, produce:

1. evidence map
2. contradiction map
3. missing-proof map
4. adversarial attack-surface map
5. current-state platform map
6. target-state platform map
7. final paper outline

Do not write the final paper in the synthesis phase.

Important constraint:

This archive contains repository truth, verified local-live truth, and unverified cloud/enterprise claims.
You must preserve those boundaries rigorously.
You must not present cloud or enterprise deployment claims as verified unless a packet explicitly proves them.
```

## Exact Upload Order

Use this order.

It is the best balance of rigor and simplicity:

1. primary evidence first
2. authoritative synthesis second
3. supplemental interim synthesis third
4. protocol-only packet last

### Upload order

1. Packet 1
2. Packet 2
3. Packet 3
4. Packet 5
5. Packet 6
6. Packet 7
7. Packet 8
8. Packet 11
9. Packet 12
10. Packet 13
11. Packet 16
12. Packet 14
13. Packet 15
14. Packet 9
15. Packet 10
16. Packet 4

## Wrapper To Use For Primary Evidence Packets

Use this wrapper for packets:

- 1
- 2
- 3
- 5
- 6
- 7
- 8
- 11
- 12
- 13
- 16

```text
EVIDENCE PACKET: PACKET <number>
Title: <exact packet title>
Packet role: primary evidence
Truth domain: <repo-only | verified local-live | mixed>
Priority: <critical | high | medium>
Rule: treat the attached file as canonical primary evidence. Preserve packet numbering exactly. Do not summarize yet. Wait for more packets.
```

## Wrapper To Use For Authoritative Synthesis Packets

Use this wrapper for packets:

- 14
- 15

```text
EVIDENCE PACKET: PACKET <number>
Title: <exact packet title>
Packet role: authoritative synthesis
Truth domain: <repo-only | verified local-live | mixed>
Priority: <critical | high | medium>
Rule: treat the attached file as authoritative synthesis built from the primary evidence archive. If it conflicts with primary evidence, primary evidence wins. Preserve packet numbering exactly. Do not summarize yet. Wait for more packets.
```

## Wrapper To Use For Supplemental Interim Synthesis Packets

Use this wrapper for packets:

- 9
- 10

```text
EVIDENCE PACKET: PACKET <number>
Title: <exact packet title>
Packet role: supplemental interim synthesis
Truth domain: mixed
Priority: medium
Rule: treat the attached file as an earlier non-canonical synthesis snapshot. Use it only as supplemental framing. If it conflicts with primary evidence or later authoritative synthesis, it loses. Preserve packet numbering exactly. Do not summarize yet. Wait for more packets.
```

## Wrapper To Use For The Protocol-Only Packet

Use this wrapper for packet:

- 4

```text
EVIDENCE PACKET: PACKET 4
Title: <exact packet title>
Packet role: protocol note
Truth domain: protocol-only
Priority: low
Rule: this packet is not platform evidence. It is only a procedural note about how the audit was conducted. Do not use it to make platform-truth claims. Preserve packet numbering exactly. Do not summarize yet. Wait for more packets.
```

## Exact Synthesis Prompt

After all 16 packets are uploaded, paste this:

```text
SYNTHESIZE

Using all packets received so far, produce:

1. Evidence map
   - grouped by architectural domain
   - grouped by confidence class
   - grouped by truth domain

2. Contradiction map
   - repository truth vs verified local-live truth
   - architecture claims vs actual behavior
   - policy model vs execution reality
   - deployment claims vs verified environment reality

3. Missing-proof map
   - what still cannot be proven
   - which missing proofs are most dangerous
   - which missing proofs block enterprise claims

4. Adversarial attack-surface map
   - authority bleed
   - privilege bleed
   - replay abuse
   - restore abuse
   - law-firm/private confidentiality risk

5. Current-state platform map
   - ingress
   - auth
   - broker/policy
   - runtime targets
   - state stores
   - shell surfaces

6. Target-state platform map
   - single execution contract
   - single identity authority
   - single policy authority
   - durable restoreable truth
   - bounded read model
   - complete tenant-safe shell

7. Final paper outline
   - section order
   - thesis per section
   - evidence sources per section

Rules:
- findings first
- no fluff
- preserve packet numbering exactly
- preserve proven vs suspected vs low-confidence
- cite packet numbers aggressively
- do not write the final paper yet
```

## Exact Visual Map Prompt

After synthesis, paste this:

```text
Build a full visual control map of the platform using only the established packet evidence.

Required outputs:

1. Current-state platform map in Mermaid
2. Current-state trust-boundary map in Mermaid
3. Target-state platform map in Mermaid
4. Current-state vs target-state gap matrix
5. Remediation-wave map in Mermaid

Rules:
- findings first
- no generic diagrams
- no invented components
- every node must map back to packet evidence
- preserve packet numbering exactly
```

## Exact Final Paper Prompt

After synthesis and visual maps are correct, paste this:

```text
Now write the final master research paper.

Requirements:

1. Write it as an executive-grade but technically adversarial research paper.
2. Base it only on the packet evidence and synthesis already established.
3. Preserve all confidence distinctions:
   - proven issues
   - strong suspicions
   - low-confidence concerns
4. Preserve my exact packet numbering.
5. Separate clearly:
   - repository truth
   - verified local-live truth
   - unverified cloud truth
   - unverified enterprise truth
6. Do not soften the verdicts.
7. Every major section must include packet references and underlying file/line evidence.
8. Include these sections:

- Executive thesis
- Platform truth model
- Current-state system map
- Security and tenant isolation
- Broker, capability, and runtime control
- Durability, replay, and concurrency truth
- Data governance, retention, and restoreability
- Build, deployment, config, and secret drift
- Scale posture and first-failure map
- Frontend/mobile tenancy integrity
- Architectural fat and fake separation
- Adversarial attack scenarios
- Enterprise law-firm deployment implications
- Current-state vs target-state architecture
- Remediation waves
- Blockers to enterprise-grade status
- What remains unproven

9. Include Mermaid visuals for:
- current-state platform map
- target-state platform map
- trust-boundary map
- remediation roadmap

10. End with:
- brutal verdict
- enterprise readiness verdict
- exact reasons that verdict is blocked
```

## Exact Adversarial Simulation Prompt

After the final paper, paste this:

```text
Using only the established evidence, build a hostile simulation matrix.

For each scenario, provide:
- prerequisites
- exact exploit chain
- required assumptions
- expected blast radius
- what telemetry would or would not detect it
- whether recovery is possible
- what invariant must hold to block it

Scenarios:
- foreign session adoption across workspace boundaries
- direct-chat broker bypass abuse
- local-companion identity drift
- duplicate delivery and replay abuse
- stale restore with partial store recovery
- autopilot connector abuse after state drift
- entitlement/profile mismatch after workspace changes
- law-firm/private tenant confidentiality breach

Rules:
- do not invent defenses that were not proven
- preserve packet numbering exactly
```

## Exact Remediation Program Prompt

After the adversarial matrix, paste this:

```text
Using only the established evidence and final paper, build a master remediation program for the platform.

Requirements:

1. Do not propose cosmetic work.
2. Organize the work by dependency and architectural leverage.
3. Separate:
   - stop-the-bleeding fixes
   - authority unification
   - durability / restoreability
   - scale / read-model repair
   - shell completion
   - architectural simplification
4. For each workstream provide:
   - objective
   - exact problems solved
   - prerequisite work
   - files / subsystems affected
   - risk of change
   - expected platform gain
   - done criteria
5. Produce:
   - Wave 0
   - Wave 1
   - Wave 2
   - Wave 3
   - Wave 4
6. Include a current-state to target-state migration narrative.
7. Include a Mermaid roadmap.
8. Include a “do not build more features before these are fixed” section.

Rules:
- no fluff
- no fake deadlines
- no invented infrastructure
- no implementation details that are not grounded in evidence
- preserve packet numbering exactly
```

## Practical Checklist

Before starting:

1. create all 16 `.md` files
2. keep packet numbers exactly as your archive uses them
3. upload them in the order above
4. use the correct wrapper for each packet role
5. do not let GPT-5.4 Pro summarize before `SYNTHESIZE`

## Final Reminder

Your archive is no longer a neat linear stage system.

It is now a **historical forensic corpus** with:

- primary evidence
- authoritative synthesis
- interim synthesis
- procedural notes

That is normal.

The fix is not to simplify it by deleting packets.

The fix is to **label packet authority correctly**, which this file now does.
