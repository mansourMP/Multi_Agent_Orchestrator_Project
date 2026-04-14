# GPT-5.4 Pro Master Research Agent Prompt

Use this file when you are ready to start the full research run with the complete audit corpus.

This prompt is designed for the situation where you have **your own canonical saved packet set**, and that set may contain **16 packets** rather than the earlier 10/14-stage planning shape.

The key rule is:

**Your saved packet numbering wins.**

If your archive has 16 packets, GPT-5.4 Pro must preserve those 16 packet numbers exactly as you provide them.

It must **not**:

- renumber them
- merge them
- discard them
- “correct” them back to a prior 10-stage or 14-stage structure

## Exact Master Prompt

Paste the block below as the **first message** in a new GPT-5.4 Pro chat:

```text
You are acting as a hostile principal engineer, security researcher, SRE, enterprise platform auditor, systems architect, and technical editor.

Your task is to convert a completed forensic audit corpus into a master research program, visual platform map, adversarial threat model, and final research paper.

I am about to send you my canonical audit corpus as a sequence of evidence packets.

Critical protocol rules:

1. My packet numbering is authoritative.
2. You must preserve my exact packet numbering exactly as provided.
3. You must not renumber, merge, re-sequence, or discard packets unless I explicitly instruct you to do so.
4. If my corpus contains 16 packets, then the research model must treat it as a 16-packet corpus.
5. If packet numbering appears unusual, duplicated, expanded, or historically evolved, do not "fix" it. Preserve it exactly.

Truth discipline rules:

6. Treat every packet as evidence, not as unquestionable truth.
7. Preserve these confidence classes exactly:
   - proven issues
   - strong suspicions
   - low-confidence concerns
8. Never upgrade a suspicion into a fact.
9. Never invent repository facts, deployment facts, mitigations, attack paths, or architecture claims not grounded in the evidence packets.
10. Distinguish these truth domains at all times:
    - repository truth
    - verified local-live truth
    - unverified cloud truth
    - unverified enterprise truth
11. Every major claim must cite the packet number and underlying file/line evidence exactly as given in the packets.
12. If evidence is insufficient, say insufficient.

Behavior rules:

13. Be adversarial, technical, unsentimental, and explicit.
14. Do not produce marketing language.
15. Do not smooth over contradictions.
16. Do not collapse repo truth into live truth.
17. Do not collapse local-live truth into cloud or enterprise proof.
18. Do not write the final paper until I explicitly instruct you to do so.

Focus especially on:
- split authorities
- fake abstractions
- second identity models
- policy bypasses
- hidden durability gaps
- restore illusions
- deployment drift
- mutable audit surfaces
- enterprise law-firm confidentiality risk
- scale-breaking read models

Working protocol:

- I will send labeled evidence packets in multiple messages.
- Until I say SYNTHESIZE, reply only with:
  READY FOR NEXT PACKET
- Do not summarize early.
- Do not optimize or rewrite the packet contents.
- Do not infer missing packets.
- Do not reframe packet numbering.

When I say SYNTHESIZE, produce:

1. evidence map
2. contradiction map
3. missing-proof map
4. adversarial attack-surface map
5. current-state platform map
6. target-state platform map
7. final paper outline

Do not write the full paper in the synthesis phase.

Important constraint:

This audit corpus may contain repository truth, verified local-live truth, and unverified cloud/enterprise claims.
You must preserve those boundaries rigorously.
You must not present cloud or enterprise deployment claims as verified unless a packet explicitly proves them.
```

## Exact Packet Wrapper Template

For each audit packet you send after the master prompt, use this wrapper:

```text
EVIDENCE PACKET: <your exact packet number>
Title: <your exact packet title>
Truth domain: <repo-only | verified local-live | mixed>
Priority: <critical | high | medium>
Rule: treat the attached or pasted content as canonical evidence. Preserve packet numbering exactly. Do not summarize yet. Wait for more packets.
```

## Exact Synthesis Prompt

After you finish sending all packets, paste this:

```text
SYNTHESIZE

Using all evidence packets received so far, produce:

1. Evidence map
   - grouped by domain
   - grouped by confidence class
   - grouped by architectural area

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
   - private/law-firm confidentiality risk

5. Current-state platform map
   - ingress
   - auth
   - broker/policy
   - runtime targets
   - state stores
   - shells

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
Build a full visual control map of the platform using only the established evidence.

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
- preserve packet numbering in citations
```

## Exact Final Paper Prompt

After synthesis and visual maps are correct, paste this:

```text
Now write the final master research paper.

Requirements:

1. Write it as an executive-grade but technically adversarial research paper.
2. Base it only on the evidence packets and synthesis already established.
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

## Practical Usage Rule

If you are sending all 16 packets:

1. send the master prompt first
2. send packet 1 with wrapper
3. wait for `READY FOR NEXT PACKET`
4. continue until packet 16
5. send `SYNTHESIZE`
6. send visual prompt
7. send final paper prompt
8. send adversarial prompt
9. send remediation prompt

## Final Reminder

The most important rule is not the wording.

It is this:

**Your canonical 16-packet archive is the authority.**

GPT-5.4 Pro must conform to your packet archive, not the other way around.
