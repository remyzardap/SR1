#!/usr/bin/env bash
# Run one Sutaeru work package with a coding agent CLI (qwen or agy) in its own git worktree.
# Playbook: docs/spec/AGENT_OPS.md. Run as the unprivileged `agents` user, never as root.
#
#   dispatch.sh <qwen|agy> <WP-ID> <slug> "<title>"   build a WP, gate it, push, open PR into develop
#   dispatch.sh fix <qwen|agy> <WP-ID>                 feed PR review comments back, gate, push same branch
#   dispatch.sh review <qwen|agy> <WP-ID>              read-only second-opinion review, posted as a PR comment
#   dispatch.sh task <qwen|agy> <T-ID> <slug> "<title>" <file>
#                                                      free-form task: instructions in <file> instead of a spec
#                                                      section; T-ID is T-<issue number>. fix/review take T-IDs too.
#
# Nothing is pushed unless `npm run check` and `npm test` pass and no forbidden path changed.
set -euo pipefail

REPO_SLUG="${REPO_SLUG:-remyzardap/SR1}"
CLONE="${AGENTS_CLONE:-$HOME/sr1}"
WT_ROOT="${AGENTS_WT:-$HOME/wt}"
LOGDIR="${AGENTS_LOGS:-$HOME/agent-logs}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-10800}"   # seconds per agent run
MAX_AGENTS="${MAX_AGENTS:-2}"
FORBIDDEN_RE='^(\.env|secrets/|\.github/workflows/deploy\.yml$|ops/session-manager/)'
LIMIT_RE='rate.?limit|usage limit|quota|insufficient|credit balance|too many requests|\b429\b|\b402\b'

die() { echo "dispatch: $*" >&2; exit 1; }
log() { echo "[$(date +%H:%M:%S)] $*"; }

[[ $EUID -ne 0 ]] || die "refusing to run as root; use: sudo -iu agents $0 ..."
mkdir -p "$WT_ROOT" "$LOGDIR/running"

MODE=build
case "${1:-}" in fix|review|task) MODE=$1; shift ;; esac
AGENT="${1:-}"; WP="${2:-}"
[[ $AGENT =~ ^(qwen|agy)$ ]] || die "agent must be qwen or agy"
[[ $WP =~ ^(P[1-4]-[0-9]{2}|F-[0-9]{2}|T-[0-9]{1,6})$ ]] || die "WP id must look like P1-03, F-01 or T-12"
[[ $MODE != task || $WP == T-* ]] || die "task mode needs a T-<issue> id"
[[ $MODE != build || $WP != T-* ]] || die "T- ids are built with 'task', not as a WP"
[[ $MODE != task || -s ${5:-} ]] || die "task mode needs a non-empty instructions file"
command -v "$AGENT" >/dev/null || die "$AGENT is not installed for user $(whoami)"
command -v gh >/dev/null || die "gh is not installed"

TASKFILE="$LOGDIR/$WP.task.md"   # T- tasks: the instructions, kept for later fix/review runs
if [[ $WP == T-* ]]; then SPEC_REF="the task instructions in $TASKFILE"
elif [[ $WP == F-* ]]; then SPEC_REF="docs/spec/FRONTEND.md section $WP"
else SPEC_REF="docs/spec/PHASE-${WP:1:1}.md section $WP"; fi
case $AGENT in agy) AGENT_NAME=antigravity-cli ;; qwen) AGENT_NAME=qwen-code ;; esac
START=$(date +%s)

# ---- concurrency cap -------------------------------------------------------
running=0
for f in "$LOGDIR"/running/*.pid; do
  [[ -e $f ]] || continue
  if kill -0 "$(cat "$f")" 2>/dev/null; then running=$((running + 1)); else rm -f "$f"; fi
done
(( running < MAX_AGENTS )) || die "$running agents already running (MAX_AGENTS=$MAX_AGENTS)"
PIDFILE="$LOGDIR/running/$WP.$MODE.pid"
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

score() {  # date WP agent mode gate minutes
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -I)" "$WP" "$AGENT" "$MODE" "$1" \
    $(( ($(date +%s) - START) / 60 )) >> "$LOGDIR/scoreboard.tsv"
}

retry() {  # retry a network command with 2/4/8/16 s backoff
  local n=0
  until "$@"; do
    n=$((n + 1)); (( n <= 4 )) || return 1
    sleep $((2 ** n))
  done
}

run_agent() {  # <workdir> <prompt> <logfile>
  local dir=$1 prompt=$2 out=$3 rc=0
  log "running $AGENT in $dir (log: $out)"
  if [[ $AGENT == qwen ]]; then
    # Qwen Code headless: -p runs one prompt and exits; --yolo auto-approves its tools
    (cd "$dir" && timeout "$AGENT_TIMEOUT" qwen -p "$prompt" --yolo) >"$out" 2>&1 || rc=$?
  else
    (cd "$dir" && timeout "$((AGENT_TIMEOUT + 60))" agy -p "$prompt" --output-format stream-json \
      --dangerously-skip-permissions --print-timeout "${AGENT_TIMEOUT}s") >"$out" 2>&1 || rc=$?
  fi
  if (( rc != 0 )); then
    if tail -n 20 "$out" | grep -qiE "$LIMIT_RE"; then
      score limit; die "$AGENT hit a rate or credit limit; nothing pushed (see $out)"
    fi
    log "$AGENT exited with code $rc; gating anyway"
  fi
}

checks() {  # <workdir> -> 0 if typecheck and tests pass
  (cd "$1" && npm run check >"$LOGDIR/$WP.check.log" 2>&1 && npm test >"$LOGDIR/$WP.test.log" 2>&1)
}

gate() {  # <workdir>: forbidden paths, clean tree, checks
  local dir=$1 bad
  if [[ -n $(git -C "$dir" status --porcelain) ]]; then
    git -C "$dir" status --short | head -20
    return 1
  fi
  bad=$(git -C "$dir" diff --name-only origin/develop...HEAD | grep -E "$FORBIDDEN_RE" || true)
  if [[ -n $bad ]]; then echo "forbidden paths changed:"; echo "$bad"; return 1; fi
  checks "$dir" || { echo "check/test failed: see $LOGDIR/$WP.check.log and $WP.test.log"; return 1; }
}

branch_for_wp() {
  git -C "$CLONE" ls-remote --heads origin "wp/$WP-*" | awk '{print $2}' | sed 's#refs/heads/##' | head -1
}

pr_for_branch() {
  gh pr list --repo "$REPO_SLUG" --head "$1" --state open --json number -q '.[0].number'
}

retry git -C "$CLONE" fetch --quiet origin develop
git -C "$CLONE" worktree prune

# ---- build / task ----------------------------------------------------------
if [[ $MODE == build || $MODE == task ]]; then
  SLUG="${3:-}"; TITLE="${4:-}"
  [[ $SLUG =~ ^[a-z0-9-]+$ && -n $TITLE ]] || die "usage: $0 [task] <qwen|agy> <id> <slug> \"<title>\" [file]"
  if [[ $MODE == task ]]; then
    [[ $5 -ef $TASKFILE ]] || cp "$5" "$TASKFILE"
  fi
  BRANCH="wp/$WP-$SLUG"; WT="$WT_ROOT/$WP"
  [[ ! -e $WT ]] || die "$WT already exists; use 'fix', or remove it with: git -C $CLONE worktree remove $WT"
  [[ -z $(branch_for_wp) ]] || die "a wp/$WP-* branch already exists on origin; use 'fix'"
  git -C "$CLONE" worktree add -q -B "$BRANCH" "$WT" origin/develop
  log "npm ci"; (cd "$WT" && npm ci --no-audit --no-fund >"$LOGDIR/$WP.npm.log" 2>&1)
  log "baseline check on develop"
  if ! checks "$WT"; then
    # nothing was built yet: drop the worktree and branch so a retry starts clean
    git -C "$CLONE" worktree remove --force "$WT"; git -C "$CLONE" branch -q -D "$BRANCH" || true
    score baseline-red
    echo "--- last lines of $WP.check.log / $WP.test.log:"
    tail -n 15 "$LOGDIR/$WP.check.log" "$LOGDIR/$WP.test.log" 2>/dev/null | sed 's/^/  /'
    die "develop is red before any change; fix develop first (logs in $LOGDIR)"
  fi

  if [[ $MODE == task ]]; then
    WHAT="Read first, fully: docs/spec/HANDOVER.md, docs/spec/README.md, then $SPEC_REF.
Do exactly what those instructions ask, no more, with tests for the new behaviour including failure paths.
Read the existing code and tests you change before changing them. Commit in small commits."
  else
    WHAT="Read first, fully: docs/spec/HANDOVER.md, docs/spec/README.md, docs/spec/END_GOAL.md section 7,
$SPEC_REF, and every file listed under \"Files\" in that section, plus their existing tests.
Implement exactly that section, with the tests it names and failure-path tests. Commit in small commits."
  fi
  PROMPT="You are implementing $WP ($TITLE) in the Sutaeru repository. Your working tree is already on
branch $BRANCH from origin/develop and npm ci has run; npm run check and npm test pass right now.
$WHAT
Every commit message ends with the trailer line:  Agent: $AGENT_NAME
(this replaces HANDOVER rule 11 for you; do not add a Claude co-author line).
Run npm run check and npm test until both pass, and leave no uncommitted changes.
Do NOT push, do NOT open a PR, do NOT touch .env, secrets/, .github/workflows/deploy.yml,
ops/session-manager/ or any container.
When done, write the PR body (docs/spec/README.md section 5.3 template, every acceptance criterion or
instruction with evidence) to $LOGDIR/$WP.pr.md. If the spec or instructions are wrong or impossible,
write that explanation to the same file instead and stop."
  rm -f "$LOGDIR/$WP.pr.md"
  run_agent "$WT" "$PROMPT" "$LOGDIR/$WP.$AGENT.jsonl"

  [[ -s $LOGDIR/$WP.pr.md ]] || { score red; die "agent wrote no PR body ($LOGDIR/$WP.pr.md); nothing pushed"; }
  if [[ $(git -C "$WT" rev-list --count origin/develop..HEAD) == 0 ]]; then
    score no-commits; cat "$LOGDIR/$WP.pr.md"; die "no commits; the agent's note is above"
  fi
  gate "$WT" || { score red; die "gate red; nothing pushed. Worktree kept at $WT"; }
  retry git -C "$WT" push -q -u origin "$BRANCH"
  retry gh pr create --repo "$REPO_SLUG" --base develop --head "$BRANCH" \
    --title "[$WP] $TITLE" --body-file "$LOGDIR/$WP.pr.md"
  score green; log "done: PR opened for $BRANCH"
  exit 0
fi

# ---- fix / review need an existing branch and PR ---------------------------
BRANCH=$(branch_for_wp); [[ -n $BRANCH ]] || die "no wp/$WP-* branch on origin"
PR=$(pr_for_branch "$BRANCH"); [[ -n $PR ]] || die "no open PR for $BRANCH"
FEEDBACK="$LOGDIR/$WP.feedback.md"
{
  echo "# Review feedback on PR #$PR"
  gh pr view "$PR" --repo "$REPO_SLUG" --comments
  echo; echo "## Inline review comments"
  gh api "repos/$REPO_SLUG/pulls/$PR/comments" --paginate \
    --jq '.[] | "- \(.path):\(.line // .original_line // "?") — \(.user.login): \(.body)"'
} > "$FEEDBACK"

if [[ $MODE == fix ]]; then
  WT="$WT_ROOT/$WP"
  retry git -C "$CLONE" fetch --quiet origin "$BRANCH"
  if [[ ! -e $WT ]]; then
    git -C "$CLONE" worktree add -q -B "$BRANCH" "$WT" "origin/$BRANCH"
  else
    git -C "$WT" merge --ff-only -q "origin/$BRANCH" || die "$WT has diverged from origin/$BRANCH; sort it out by hand"
  fi
  [[ -d $WT/node_modules ]] || (cd "$WT" && npm ci --no-audit --no-fund >"$LOGDIR/$WP.npm.log" 2>&1)
  PROMPT="You are fixing work package $WP in the Sutaeru repository, on branch $BRANCH (PR #$PR into develop).
Read docs/spec/HANDOVER.md, docs/spec/README.md, $SPEC_REF, then the review feedback in $FEEDBACK.
Address every must-fix item and every CI failure. If the feedback asks you to merge origin/develop, use
git merge (never rebase, never force-push). For any item you disagree with, explain why instead of changing code.
Commit with the trailer line:  Agent: $AGENT_NAME
Run npm run check and npm test until both pass, and leave no uncommitted changes.
Do NOT push, do NOT touch .env, secrets/, .github/workflows/deploy.yml, ops/session-manager/ or containers.
Write a short reply for the PR (what you changed per item, and anything you declined, with reasons)
to $LOGDIR/$WP.reply.md."
  rm -f "$LOGDIR/$WP.reply.md"
  before=$(git -C "$WT" rev-parse HEAD)
  run_agent "$WT" "$PROMPT" "$LOGDIR/$WP.$AGENT.fix.jsonl"
  [[ $(git -C "$WT" rev-parse HEAD) != "$before" ]] || { score no-commits; die "no new commits; nothing pushed"; }
  gate "$WT" || { score red; die "gate red; nothing pushed. Worktree kept at $WT"; }
  retry git -C "$WT" push -q origin "$BRANCH"
  [[ -s $LOGDIR/$WP.reply.md ]] && gh pr comment "$PR" --repo "$REPO_SLUG" --body-file "$LOGDIR/$WP.reply.md"
  score green; log "done: pushed fixes to $BRANCH"
  exit 0
fi

# ---- review (read-only, separate detached worktree) ------------------------
WT="$WT_ROOT/$WP-review"
retry git -C "$CLONE" fetch --quiet origin "$BRANCH"
[[ ! -e $WT ]] || git -C "$CLONE" worktree remove --force "$WT"
git -C "$CLONE" worktree add -q --detach "$WT" "origin/$BRANCH"
(cd "$WT" && npm ci --no-audit --no-fund >"$LOGDIR/$WP.npm.log" 2>&1)
OUT="$LOGDIR/$WP.review.$AGENT.md"; rm -f "$OUT"
PROMPT="You are a read-only second reviewer for work package $WP in the Sutaeru repository (PR #$PR into develop).
Do NOT edit, commit or push anything. Read docs/spec/README.md (rules and the section 5 review rubric),
docs/spec/END_GOAL.md section 7, $SPEC_REF, the existing feedback in $FEEDBACK, and the diff:
git diff origin/develop...HEAD
Run npm run check and npm test. Hunt for real defects: spec acceptance criteria not met, missing failure-path
tests, safety rule breaks (G1 to G4, approvals, secrets or user content in logs), env vars read at import time,
migrations that are not additive or idempotent, flags not defaulting off, broken SSE compatibility.
Write your findings to $OUT as a numbered list, each with file:line, what is wrong, and a concrete failure
scenario. Put a one-line verdict first: LOOKS GOOD or CHANGES SUGGESTED. Skip style nits."
run_agent "$WT" "$PROMPT" "$LOGDIR/$WP.$AGENT.review.jsonl"
git -C "$WT" reset -q --hard && git -C "$WT" clean -qfd   # discard anything it touched
[[ -s $OUT ]] || { score red; die "reviewer wrote nothing to $OUT"; }
{ echo "**Second-opinion review by $AGENT_NAME** (read-only, per docs/spec/AGENT_OPS.md §4.3)"; echo; cat "$OUT"; } \
  | gh pr comment "$PR" --repo "$REPO_SLUG" --body-file -
git -C "$CLONE" worktree remove --force "$WT"
score green; log "done: review posted on PR #$PR"
