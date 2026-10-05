# Sutaeru — Final Build Plan

## Objective

Finish Sutaeru as a coherent AI workspace, with the **frontend and backend progressing in parallel today**.

The finish line is:

> A user can ask Sutaeru to research, reason, create/edit documents, code, generate files, verify its work, and return the finished artifacts directly into the conversation.

---

# 1. Execution model — TWO EXECUTORS

We will run **two execution tracks in parallel**.

## Executor A — Frontend / Product UI

Owns everything the user sees and interacts with.

### Deliver today

1. **Canonical app shell**
   - Sutaeru branding
   - desktop navigation
   - mobile navigation
   - remove redundant bottom navigation
   - consistent light/dark/theme behavior
   - no dead routes or placeholder navigation

2. **Primary navigation**

```text
SUTAERU

Chat

Workspace
  ├── Docs
  ├── Code
  ├── Research
  └── Files

Create
  ├── Images
  └── Video

More
  ├── Memories
  ├── Skills
  ├── Connections
  ├── Monitors
  ├── Settings
  └── Admin
```

Chat remains the front door.

3. **Workspace UI**
   - Workspace landing page
   - Docs / Code / Research / Files switcher
   - persistent workspace/project context
   - recent work
   - clear empty states
   - responsive layouts

4. **Docs UI**
   - New document
   - blank document
   - document from Chat
   - document from Research
   - document from Files
   - document templates
   - document list/editor/viewer
   - export/download actions

5. **Code Workspace UI**
   - integrate the existing Code Sessions implementation
   - session list
   - project selection
   - access level UI
   - live events
   - approvals
   - stop/cancel
   - attachments
   - finished artifact display

6. **Research UI**
   - research task creation
   - progress/events
   - source/evidence visibility
   - final result
   - generated artifacts

7. **Files / Artifacts UI**
   - project files
   - generated artifacts
   - upload
   - preview
   - download
   - send to Chat
   - clear ownership/context

8. **Chat integration**
   - Chat can launch Workspace work
   - Chat can receive generated documents/files
   - artifacts appear as first-class attachments
   - user can continue working on an artifact from Chat

### Frontend definition of done

A new user should understand Sutaeru without being told how the underlying agents, providers, worktrees, or servers work.

---

# 2. Executor B — Backend / Kemma / Product Infrastructure

Owns orchestration, agents, tools, documents, artifacts, security and server-side integration.

## Deliver today

### A. Canonicalize the codebase

Primary repo:

`/root/sr1`

Before major changes:

- establish baseline
- inspect current branches/worktrees
- review useful changes from `wt-b3`
- merge only useful document-pipeline work
- remove/ignore abandoned experiments
- create a clean implementation baseline

Do not create another parallel architecture.

---

### B. Workspace backend

Create the backend primitives needed by the frontend:

- workspace/project identity
- workspace context
- persistent sessions
- project files
- artifact references
- Chat ↔ Workspace relationships
- permissions/ownership

---

### C. Artifact system

Artifacts are first-class Sutaeru objects.

Initial supported types:

- PDF
- DOCX
- XLSX
- CSV
- ZIP
- TXT
- MD
- images

Each artifact should retain:

- owner
- workspace/project
- source session/task
- MIME type
- size
- creation time
- status
- permissions
- download/reference location

Required operations:

- create
- store
- preview
- download
- attach to Chat
- attach to Workspace
- replace/version

---

### D. Documents

Finish the existing document pipeline rather than rebuilding it.

Required flow:

```text
Chat / Research / Files
        ↓
Create Document
        ↓
Draft
        ↓
Evidence / citation validation
        ↓
Quality review
        ↓
Final document
        ↓
Artifact
        ↓
Chat attachment + Workspace
```

Document quality checks:

- citations
- URLs
- source quality
- word count
- section completeness
- numerical consistency
- broken links
- academic/report structure where relevant

---

# 3. Kemma 2.0

Consolidate the existing orchestration work under:

```text
server/kemma/
  core/
    orchestrator.ts
    planner.ts
    agentRuntime.ts
    toolRouter.ts
    modelRouter.ts
    taskState.ts
    budgetManager.ts
    scheduler.ts

  agents/
  tools/
  research/
  verification/
  providers/
  memory/
```

Do not rebuild functionality that already exists.

Kemma should become the execution runtime behind Sutaeru.

---

# 4. Research execution pipeline

Target workflow:

```text
User request
    ↓
Planner
    ↓
Parallel researchers
    ↓
Search / Browse
    ↓
Evidence ledger
    ↓
Source deduplication
    ↓
Contradiction detection
    ↓
Numerical verification
    ↓
Draft
    ↓
Adversarial review
    ↓
Kemma Judge
    ↓
PASS / REWORK
    ↓
Final answer / artifact
```

Existing research infrastructure should be reused and consolidated.

---

# 5. Model / provider strategy

Do not spend today rebuilding provider infrastructure unless required for the finish line.

Target strategy:

- **Qwen** — primary reasoning, coding, synthesis, long-form
- **Gemini** — fast/simple tasks, vision, document/image understanding, independent verification
- **Nemotron** — planning, deep reasoning, adversarial review, future private inference
- **SearXNG** — open/free search
- **Perplexity** — premium search fallback
- **Exa** — only if benchmarks justify it

The abstraction should make providers replaceable.

---

# 6. Existing Code Agent

**Do not rebuild the Code Agent.**

The VPS already contains a substantial coding-agent bridge with:

- persistent sessions
- read/edit/full modes
- TOTP-gated full access
- attachments
- approvals
- session events
- Telegram nudges
- provider failover
- session persistence
- server-side authorization
- project restrictions

The work now is:

1. integrate it into Workspace
2. polish the UX
3. connect artifacts
4. test isolation/security
5. make the experience feel native to Sutaeru

---

# 7. Security

Security work is mandatory before final deployment.

Audit:

- authentication
- authorization
- workspace isolation
- session isolation
- artifact ownership
- attachment isolation
- filesystem boundaries
- prompt injection
- tool escape
- command execution
- Code full-access mode
- TOTP enforcement
- cross-user UUID access
- process stopping/cancellation
- secret-file protection

Also verify:

- no secrets in generated artifacts
- no unintended public listeners
- no debug endpoints exposed
- no accidental cross-workspace access

---

# 8. Chat ↔ Workspace

This is the core product loop.

Example:

> “Research Indonesia's solar market, write a report, make the financial model, check your work, and send me the files.”

Expected execution:

```text
Chat
 ↓
Kemma plans
 ↓
Research
 ↓
Verification
 ↓
Document generation
 ↓
Spreadsheet generation
 ↓
Quality review
 ↓
Artifacts stored
 ↓
Artifacts attached to Chat
 ↓
User receives finished work
```

The user should not need to know which agent, provider, worktree, browser, search engine, or server executed each step.

---

# 9. QA

Final QA must cover:

### Frontend
- desktop
- mobile
- navigation
- Chat
- Workspace
- Docs
- Code
- Research
- Files
- Create
- Settings/Admin
- light/dark
- loading/error/empty states

### Backend
- API tests
- auth tests
- workspace isolation
- Code Sessions
- document pipeline
- artifact lifecycle
- research pipeline
- provider failure handling

### Browser smoke test

Verify the real deployed UI, not only unit tests.

---

# 10. Execution order

Because the frontend must also be finished today, the two executors work concurrently.

### Executor A — Frontend

```text
1. App shell
2. Navigation
3. Workspace shell
4. Docs UI
5. Code Workspace UI
6. Research UI
7. Files/Artifacts UI
8. Chat integration
9. Responsive polish
10. Browser QA
```

### Executor B — Backend

```text
1. Canonicalize codebase
2. Workspace primitives
3. Artifact system
4. Docs integration
5. Kemma consolidation
6. Research pipeline
7. Chat ↔ Workspace APIs
8. Security audit
9. Backend QA
10. Deployment
```

The executors should coordinate through stable contracts rather than repeatedly editing the same files.

---

# 11. Freeze list

Do **not** spend today's execution time on:

- new agent names
- Kemma personality redesign
- additional providers
- voice
- WhatsApp expansion
- video API expansion
- fancy animations
- full visual redesign
- rebuilding Code Agent
- rebuilding Research Agent
- Figma/Penpot integration
- another frontend framework
- another orchestration architecture

The objective is **finish, integrate, test, deploy**.

---

# 12. Definition of done

Sutaeru is done for this phase when a user can:

1. open Chat
2. open Workspace
3. create/select a project
4. research something
5. create a document
6. run Code against the project
7. upload/use files
8. generate artifacts
9. review/verify the work
10. return to Chat
11. receive the finished artifacts directly in the conversation
12. continue editing or working on them

The product should feel like **one system**, not a collection of agents and experiments.

---

## Final principle

**Two executors, one product.**

Executor A finishes the **front end and user experience**.

Executor B finishes the **backend, Kemma, documents, artifacts, research and infrastructure**.

They work in parallel against explicit contracts and a shared definition of done. The goal is not to build more systems. The goal is to finish Sutaeru.
