# Kemma 2.0 — Orchestration Runtime Implementation Plan

**Project:** Sutaeru  
**Primary orchestrator:** Kemma  
**Status:** Architecture / implementation plan  
**Target:** Existing Sutaeru codebase at `/root/sr1`

---

## 1. Objective

Upgrade Kemma from the current orchestration engine into a full **AI orchestration runtime**.

Kemma should be able to:

- understand a task
- classify complexity
- plan work
- select models
- create bounded specialist agents
- select and invoke tools
- conduct web/document research
- maintain research state
- collect structured evidence
- detect contradictions
- verify claims
- perform deterministic calculations
- review and improve drafts
- judge output quality
- stop when the answer is sufficiently reliable
- deliver the final answer

The goal is **not** to turn Sutaeru into a collection of LLM APIs.

> **Kemma is the intelligence orchestrator. Models and tools are replaceable specialists.**

---

# 2. Target Architecture

```
                         USER
                           |
                           v
                    +-------------+
                    |    KEMMA    |
                    | ORCHESTRATOR|
                    +------+------+
                           |
              +------------+------------+
              |            |            |
            SIMPLE       TOOLS       RESEARCH
              |            |            |
              v            v            v
          Gemini/Qwen   Tool Router   Research Planner
                                          |
                                  +-------+-------+
                                  |       |       |
                                  v       v       v
                                 A1      A2      A3
                                  |       |       |
                                  +-------+-------+
                                          |
                                   EVIDENCE LEDGER
                                          |
                                          v
                                        DRAFT
                                          |
                         +----------------+----------------+
                         |                |                |
                         v                v                v
                    Evidence QA      Reasoning QA     Adversarial QA
                     Gemini          Qwen/Nemotron       Nemotron
                         |                |                |
                         +----------------+----------------+
                                          |
                                   KEMMA JUDGE
                                          |
                                  +-------+-------+
                                  |               |
                                 FAIL            PASS
                                  |               |
                              RESEARCH/          FINAL QA
                              IMPROVE              |
                                                  v
                                               USER
```

---

# 3. Model Strategy

## Qwen — Primary Intelligence

Use for:

- deep reasoning
- coding
- synthesis
- long-form writing
- document generation
- research synthesis
- complex analysis

Qwen should generally be the primary generator.

## Gemini — Multimodal / Fast / Independent Verification

Use for:

- fast/simple requests
- vision
- document/image understanding
- URL understanding
- Google-grounded workflows where useful
- evidence extraction
- independent fact checking
- editorial pass

Gemini should frequently act as a second model family reviewing Qwen output.

## NVIDIA Nemotron — Agentic / Reasoning / Adversarial

Use for:

- complex planning
- research planning
- difficult reasoning
- multi-agent workflows
- adversarial review
- research judging
- future private/self-hosted intelligence

Support NVIDIA NIM now and design for open Nemotron models through vLLM/SGLang later.

## Search

### SearXNG

Default open search/discovery layer.

### Perplexity

Premium/high-quality search fallback.

### Exa

Keep behind the SearchProvider interface and add only if benchmarking proves it materially improves research.

---

# 4. Provider Abstraction

Create:

```
server/kemma/providers/
  provider.ts
  registry.ts
  qwen.ts
  gemini.ts
  nvidia.ts
```

And:

```
server/kemma/modelRouter.ts
```

The router should select by:

- capability
- task complexity
- expected quality
- latency
- quota/availability
- context requirement
- cost
- historical benchmark performance

The frontend must not select providers directly.

---

# 5. Kemma Core Runtime

Create/refactor:

```
server/kemma/core/
  orchestrator.ts
  planner.ts
  agentRuntime.ts
  toolRouter.ts
  modelRouter.ts
  taskState.ts
  budgetManager.ts
  scheduler.ts
```

## Orchestrator

Owns the complete lifecycle:

```
Understand
  -> Plan
  -> Execute
  -> Evaluate
  -> Improve
  -> Judge
  -> Deliver
```

## Planner

Determines:

- task type
- complexity
- required capabilities
- required tools
- whether agents are needed
- whether research is required
- expected stopping condition

## Agent Runtime

Agents must be bounded.

Each agent receives:

- objective
- context
- model
- allowed tools
- permissions
- token budget
- time limit
- maximum steps
- output schema

Agents must not recursively spawn unlimited agents.

---

# 6. Tool Registry

Create:

```
server/kemma/tools/
  registry.ts
  types.ts
  permissions.ts
```

Every tool should expose:

- id
- description
- input schema
- output schema
- permissions
- timeout
- cost
- risk level

Initial tools:

### Web

- SearXNG
- Perplexity
- browser/fetch
- page extraction

### Files

- PDF parsing
- document parsing
- spreadsheet reading
- file search

### Computation

- Python
- calculator
- data analysis

### Code

- sandbox
- repository operations

### Memory

- vector search
- structured memory

---

# 7. Browser / Web Research

Separate discovery from investigation.

Create:

```
server/kemma/search/
  provider.ts
  router.ts
  searxng.ts
  perplexity.ts

server/kemma/browser/
  browser.ts
  fetch.ts
  extractor.ts
  page.ts
```

Workflow:

```
Search
  -> Open source
  -> Read source
  -> Follow relevant links
  -> Extract tables/data
  -> Download documents
  -> Extract evidence
```

Search results are **candidate evidence**, not truth.

---

# 8. Evidence Ledger

Create a structured evidence layer.

Each important claim should contain:

```
Claim
  id
  statement
  sources[]
  evidence[]
  confidence
  sourceQuality
  publishedAt
  retrievedAt
  contradictions[]
  verificationStatus
```

The ledger becomes the source of truth for the research workflow.

---

# 9. Verification Engine

Create:

```
server/kemma/verification/
  claimVerifier.ts
  evidenceReviewer.ts
  reasoningReviewer.ts
  adversarialReviewer.ts
  contradictionDetector.ts
  qualityJudge.ts
```

## Evidence Reviewer

Checks:

- does source actually support claim?
- source authority
- source freshness
- citation coverage
- missing evidence

## Reasoning Reviewer

Checks:

- logical consistency
- hidden assumptions
- unsupported conclusions
- causal reasoning
- internal consistency

## Adversarial Reviewer

Attempts to disprove the answer.

Preferred model:

**NVIDIA Nemotron**

Secondary:

**Gemini/Qwen**

The writer should not automatically be the sole reviewer.

---

# 10. Contradiction Detection

If sources disagree, Kemma must explicitly investigate.

Example:

```
Source A: 12 GW
Source B: 14 GW
Source C: 19 GW

        |
        v

CONFLICT DETECTED

Check:
- reporting period
- geographic scope
- definitions
- AC/DC
- pipeline vs installed
- primary source
```

If unresolved, the final answer must communicate uncertainty instead of silently choosing a number.

---

# 11. Numerical Verification

Use deterministic code/Python for:

- CAGR
- IRR
- NPV
- percentages
- financial models
- statistical calculations
- unit conversions
- table consistency

LLM proposes the calculation.

Python verifies it.

If they disagree:

```
FAIL
  -> correct calculation
  -> update evidence/draft
  -> re-review
```

---

# 12. Research Workspace

Every substantial research task should have persistent state:

```
ResearchJob
  objective
  plan
  agents
  toolCalls
  sources
  claims
  evidence
  calculations
  contradictions
  drafts
  reviews
  qualityScore
  final
```

This prevents large research jobs from depending on one model context.

---

# 13. Research Workflow

## Normal Research

```
Question
  -> Kemma Planner
  -> Research Plan
  -> Parallel Agents
  -> Search
  -> Browse
  -> Evidence Ledger
  -> Draft
  -> Evidence Review
  -> Reasoning Review
  -> Improve
  -> Final QA
  -> Answer
```

## Deep Research

```
Question
  -> Kemma
  -> Nemotron planning
  -> specialist agents
  -> multiple search providers
  -> primary-source retrieval
  -> evidence ledger
  -> cross-source verification
  -> Qwen synthesis
  -> Gemini evidence review
  -> Nemotron adversarial review
  -> Python numerical verification
  -> Kemma Judge
  -> REWORK or PASS
  -> final editor
  -> user
```

---

# 14. Quality Judge

Create a final Kemma quality gate.

Initial scoring model:

| Dimension | Weight |
|---|---:|
| Factual accuracy | 20% |
| Evidence coverage | 20% |
| Source quality | 15% |
| Reasoning | 15% |
| Completeness | 10% |
| Citation quality | 10% |
| User-question alignment | 10% |

Initial policy:

- 90–100: deliver
- 80–89: minor improvement
- 70–79: review again
- <70: research again

Weights should eventually be calibrated against real Sutaeru benchmarks.

---

# 15. Research Stopping Rule

Kemma should stop when:

- major claims are supported
- primary sources are used where available
- important contradictions are resolved
- evidence coverage is sufficient
- user question is fully answered
- material gaps are absent
- quality threshold is passed

Do not use a fixed number of searches as the stopping condition.

---

# 16. MCP Gateway

After the internal tool architecture is stable:

```
Kemma
  |
MCP Gateway
  |
+-------------------------------+
| GitHub                        |
| Google Drive                  |
| Slack                         |
| databases                     |
| CRM                           |
| financial systems             |
| customer-specific tools       |
+-------------------------------+
```

The gateway must have:

- explicit permissions
- read/write separation
- approval requirements
- audit logging
- timeouts
- risk classification

MCP expands Kemma; it does not replace Kemma.

---

# 17. Provider Benchmark

Build a Sutaeru-specific benchmark suite of approximately 100–200 tasks.

Categories:

- reasoning
- coding
- research
- vision
- document analysis
- tool use
- long context
- structured output
- financial analysis
- citation accuracy

Measure:

- quality
- accuracy
- latency
- failure rate
- tool success
- citation quality
- cost

Use the results to continuously improve model routing.

---

# 18. Future Private Sutaeru

Design the provider interface for:

```
Kemma
  |
  +-- Qwen API
  +-- Gemini API
  +-- NVIDIA NIM
  |
  +-- Local inference
       +-- Nemotron
       +-- Qwen
       +-- other open models
```

Do not deploy local inference until there is a business/technical reason.

---

# 19. Security / Agent Boundaries

No agent gets unrestricted access.

Example:

```
Market Research Agent

Allowed:
  Search
  Browser
  PDF
  Evidence Ledger

Denied:
  Send email
  Modify production DB
  Arbitrary shell
  Private files
  Agent spawning
```

Each tool call should be permission-checked.

---

# 20. Implementation Sequence

## Sprint 1 — Foundation

- Kemma orchestrator
- task state
- agent runtime
- tool registry
- model abstraction
- budgets
- timeouts

## Sprint 2 — Intelligence

- Qwen provider
- Gemini provider
- NVIDIA provider
- capability-based routing
- health/fallback

## Sprint 3 — Research

- SearXNG
- Perplexity adapter
- browser
- source extraction
- evidence ledger

## Sprint 4 — Quality

- claim verifier
- contradiction detector
- evidence reviewer
- reasoning reviewer
- adversarial reviewer
- numerical verification

## Sprint 5 — Deep Research

- research planner
- parallel agents
- stopping rules
- research workspace
- synthesis
- final judge

## Sprint 6 — Extensibility

- MCP gateway
- external tools
- benchmark system
- telemetry
- local-model interface

---

# 21. Parallel Coding Agent Strategy

The VPS should not have every agent editing the same working tree.

Use isolated Git worktrees.

Recommended parallel workstreams:

### Agent 1 — Core Runtime

Own:

```
server/kemma/core/
```

### Agent 2 — Provider Layer

Own:

```
server/kemma/providers/
server/kemma/modelRouter.ts
```

### Agent 3 — Search / Browser

Own:

```
server/kemma/search/
server/kemma/browser/
```

### Agent 4 — Evidence / Verification

Own:

```
server/kemma/verification/
server/kemma/evidence/
```

### Agent 5 — Tests / Benchmark

Own:

```
evals/
tests/
benchmark infrastructure
```

### Agent 6 — Integration / Review

After the first five complete:

- reconcile branches
- resolve conflicts
- integrate APIs
- run tests
- inspect architecture
- fix regressions

Do **not** run six agents simultaneously against the same files.

---

# 22. VPS Capacity Check

Current VPS inspection:

- **CPU:** 16 logical cores
- **RAM:** 31 GiB
- **Available RAM:** ~23 GiB at inspection time
- **Swap:** 4 GiB
- **Load average:** ~0.90 / 0.45 / 0.41
- **OS:** Linux
- **Node:** 20.20.2
- **Python:** 3.10.12
- Sutaeru development servers are already running.
- Multiple Claude/Kimi/AGY processes are already present.

The VPS therefore has enough resources for several concurrent **API-driven coding agents**, because the heavy model inference is remote.

### Recommended concurrency

**5 coding agents + 1 integration/reviewer = 6 active agents**

is the recommended working configuration.

**8 agents** should be technically possible for mostly I/O/API-bound work, but is not the initial recommendation because filesystem contention, Git conflicts, API concurrency and model-agent context become the limiting factors before raw CPU does.

The VPS is **not** the limiting factor for the planned architecture.

The main constraints will be:

1. model/API concurrency
2. agent context windows
3. Git/worktree isolation
4. tool/API rate limits
5. integration conflicts

Local open-weight inference is a different matter and should not be counted in this agent capacity estimate.

---

# 23. Recommended Parallel Execution

```
                    KEMMA 2.0 BUILD
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
          Agent 1       Agent 2       Agent 3
          Runtime       Providers      Search
             |             |             |
             +-------------+-------------+
                           |
             +-------------+-------------+
             |                           |
             v                           v
          Agent 4                     Agent 5
        Verification                 Benchmark
             |                           |
             +-------------+-------------+
                           |
                           v
                     Agent 6
                  Integration / QA
                           |
                           v
                    Sutaeru Main
```

---

# 24. Non-Negotiable Architecture Principles

1. **Kemma remains the orchestrator.**
2. Models are replaceable specialists.
3. Search is separate from reasoning.
4. Search results are not automatically evidence.
5. Important claims require evidence.
6. Contradictions must be surfaced.
7. Calculations should be deterministic.
8. Writers should not be their own only reviewers.
9. Agents must have bounded permissions.
10. Agents must have time/step/token limits.
11. Deep research must have a stopping rule.
12. Provider selection should eventually be benchmark-driven.
13. Local models should be supported architecturally before being deployed.
14. Agents must use isolated worktrees during parallel development.
15. No large rewrite until existing Kemma functionality has been mapped and reused.

---

# 25. Definition of Done

Kemma 2.0 is ready when it can take a complex request and autonomously:

1. classify it
2. create a plan
3. select models
4. create bounded agents
5. use search/browser/tools
6. collect evidence
7. maintain research state
8. produce a draft
9. independently review it
10. detect contradictions
11. verify calculations
12. research missing evidence
13. improve the answer
14. judge quality
15. deliver a properly cited final response

At that point, Kemma is no longer merely an LLM router.

> **Kemma is Sutaeru's AI orchestration runtime.**
