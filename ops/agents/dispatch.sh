#!/usr/bin/env bash
# Run one Sutaeru work package with a coding agent CLI (qwen, agy, kimi or opencode) in its own git worktree.
# Playbook: docs/spec/AGENT_OPS.md. Run as the unprivileged `agents` user, never as root.
#
#   dispatch.sh <agent> <WP-ID> <slug> "<title>"   build a WP, gate it, push, open PR into develop
#   dispatch.sh fix <agent> <WP-ID>                 feed PR review comments back, gate, push same branch
#   dispatch.sh review <agent> <WP-ID>              read-only second-opinion review, posted as a PR comment
#   dispatch.sh ask <agent> <T-ID> <file> [ref]       investigate / diagnose / answer questions on a throwaway
#                                                      checkout of [ref] (default develop); report goes to
#                                                      $LOGDIR/<T-ID>.report.md, nothing is committed or pushed
#   dispatch.sh push <agent> <WP-ID>                   re-gate a kept worktree (agent already done) and push it,
#                                                      opening the PR if there is none; no agent run
#   dispatch.sh task <agent> <T-ID> <slug> "<title>" <file>
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
STALL_SEC="${STALL_SEC:-2400}"           # stop a run with no output and no file changes for this long
CAP_FILE="${AGENTS_CAP_FILE:-/opt/sutaeru-agents/max_agents}"   # root-owned; edit it to change the cap, no restart
max_agents() {  # the cap is re-read every time, so changing the file takes effect on the next check
  local n=""
  [[ -r $CAP_FILE ]] && n=$(tr -dc '0-9' <"$CAP_FILE" | head -c 2)
  [[ $n =~ ^[1-9]$ ]] || n="${MAX_AGENTS:-4}"
  echo "$n"
}
FORBIDDEN_RE='(^|/)\.env($|\.)|^(secrets/|\.github/workflows/deploy\.yml$|ops/session-manager/)'
ALLOWED_RE='(^|/)\.env\.example$'   # the documented list of env var names (no values); specs require new vars there
AUTH_RE='api error: 40[13]|invalid access token|token expired|not (logged|signed) in|please (log|sign) in|authenticat(e|ion) (required|failed)|unauthori[sz]ed'
LIMIT_RE='rate.?limit|usage limit|quota|insufficient|credit balance|too many requests|\b429\b|\b402\b'

die() { echo "dispatch: $*" >&2; exit 1; }
log() { echo "[$(date +%H:%M:%S)] $*"; }

[[ $EUID -ne 0 ]] || die "refusing to run as root; use: sudo -iu agents $0 ..."
mkdir -p "$WT_ROOT" "$LOGDIR/running"

MODE=build
case "${1:-}" in fix|review|task|ask|push) MODE=$1; shift ;; esac
AGENT="${1:-}"; WP="${2:-}"
[[ $AGENT =~ ^(qwen|agy|kimi|opencode)$ ]] || die "agent must be qwen, agy, kimi or opencode"
[[ $WP =~ ^(P[1-4]-[0-9]{2}|F-[0-9]{2}|T-[0-9]{1,6})$ ]] || die "WP id must look like P1-03, F-01 or T-12"
[[ ( $MODE != task && $MODE != ask ) || $WP == T-* ]] || die "$MODE mode needs a T-<issue> id"
[[ $MODE != ask || -s ${3:-} ]] || die "ask mode needs a non-empty instructions file"
[[ $MODE != build || $WP != T-* ]] || die "T- ids are built with 'task', not as a WP"
[[ $MODE != task || -s ${5:-} ]] || die "task mode needs a non-empty instructions file"
command -v "$AGENT" >/dev/null || die "$AGENT is not installed for user $(whoami)"
command -v gh >/dev/null || die "gh is not installed"

TASKFILE="$LOGDIR/$WP.task.md"   # T- tasks: the instructions, kept for later fix/review runs
if [[ $WP == T-* ]]; then SPEC_REF="the task instructions in $TASKFILE"
elif [[ $WP == F-* ]]; then SPEC_REF="docs/spec/FRONTEND.md section $WP"
else SPEC_REF="docs/spec/PHASE-${WP:1:1}.md section $WP"; fi
case $AGENT in agy) AGENT_NAME=antigravity-cli ;; qwen) AGENT_NAME=qwen-code ;; kimi) AGENT_NAME=kimi-cli ;; opencode) AGENT_NAME=opencode ;; esac
START=$(date +%s)

# ---- concurrency cap -------------------------------------------------------
running=0
for f in "$LOGDIR"/running/*.pid; do
  [[ -e $f ]] || continue
  if kill -0 "$(cat "$f")" 2>/dev/null; then running=$((running + 1)); else rm -f "$f"; fi
done
CAP=$(max_agents)
(( running < CAP )) || die "$running agents already running (cap $CAP, from $CAP_FILE)"
# share the CPUs between parallel runs: each run's vitest (gate and the agent's own npm test) gets cores/cap workers
VW=$(( $(nproc) / CAP )); (( VW >= 2 )) || VW=2
export VITEST_MAX_FORKS=$VW VITEST_MAX_THREADS=$VW VITEST_MIN_FORKS=1 VITEST_MIN_THREADS=1
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
  local dir=$1 prompt=$2 out=$3 rc=0 t0=$SECONDS pid stalled="" idle=0 last_size=-1
  local -a cmd
  case $AGENT in
    # Qwen Code headless: -p runs one prompt and exits; --yolo auto-approves its tools
    qwen) cmd=(timeout "$AGENT_TIMEOUT" qwen -p "$prompt" --yolo) ;;
    # Kimi Code CLI: --print is headless and auto-approves (deny rules in its config still apply)
    kimi) cmd=(timeout "$AGENT_TIMEOUT" kimi --print --output-format stream-json -p "$prompt") ;;
    opencode)
      # opencode.ai (sst) has `run`; permissions come from ~/.config/opencode/opencode.json (install.sh sets allow).
      # The older Go opencode (now Crush) has no `run` and auto-approves in -p mode.
      if opencode run --help >/dev/null 2>&1; then cmd=(timeout "$AGENT_TIMEOUT" opencode run "$prompt")
      else cmd=(timeout "$AGENT_TIMEOUT" opencode -p "$prompt" -q); fi ;;
    *) cmd=(timeout "$((AGENT_TIMEOUT + 60))" agy -p "$prompt" --output-format stream-json
            --dangerously-skip-permissions --print-timeout "${AGENT_TIMEOUT}s") ;;
  esac
  # Files the prompt names under $LOGDIR (task, feedback, the PR body/report to write) are mirrored into
  # <worktree>/.agent/ and the prompt points there: some CLIs (opencode) refuse paths outside their working dir.
  # .agent/ is git-excluded, so the gate never sees it; results are copied back after the run.
  local -a xfer=() f
  mkdir -p "$dir/.agent"
  grep -qx '/.agent/' "$CLONE/.git/info/exclude" 2>/dev/null || echo '/.agent/' >> "$CLONE/.git/info/exclude"
  while IFS= read -r f; do
    f=${f%%[.,;:)\"\']}; [[ -n $f ]] && xfer+=("$f")
  done < <(grep -oE "$LOGDIR/[^[:space:]]+" <<<"$prompt" | sort -u)
  for f in "${xfer[@]}"; do [[ -f $f ]] && cp "$f" "$dir/.agent/${f##*/}"; done
  prompt=${prompt//"$LOGDIR/"/"$dir/.agent/"}
  log "running $AGENT in $dir (log: $out)"
  # setsid puts the agent and everything it starts (tests, servers) in one process group we can stop as a whole
  (cd "$dir" && exec setsid "${cmd[@]}") >"$out" 2>&1 &
  pid=$!
  # watchdog: no new output AND no file changed in the worktree for STALL_SEC means the agent is stuck
  # (some CLIs print only at the end, so file activity counts too)
  RUN_MARK=$(mktemp); trap 'rm -f "$RUN_MARK" "$PIDFILE"' EXIT
  while kill -0 "$pid" 2>/dev/null; do
    sleep 30
    local size; size=$(wc -c <"$out" 2>/dev/null || echo 0)
    if [[ $size != "$last_size" ]] || [[ -n $(find "$dir" -path "$dir/node_modules" -prune -o -path "$dir/.git" -prune \
         -o -newer "$RUN_MARK" -type f -print -quit 2>/dev/null) ]]; then
      idle=0; last_size=$size; touch "$RUN_MARK"
    else
      idle=$((idle + 30))
    fi
    if (( idle >= STALL_SEC )); then
      stalled=1; log "no output or file changes for $((STALL_SEC / 60)) min; stopping $AGENT"
      kill -TERM -- "-$pid" 2>/dev/null; sleep 20; kill -KILL -- "-$pid" 2>/dev/null
      break
    fi
  done
  wait "$pid" 2>/dev/null || rc=$?
  for f in "${xfer[@]}"; do [[ -s $dir/.agent/${f##*/} ]] && cp "$dir/.agent/${f##*/}" "$f"; done
  if [[ -n $stalled ]]; then
    score stalled
    die "$AGENT stalled (no output or file changes for $((STALL_SEC / 60)) min) and was stopped; nothing pushed. Last output: $(tail -n 2 "$out" | tr '\n' ' ' | cut -c1-300)"
  fi
  # a real run takes minutes; a CLI that isn't signed in or configured quits within seconds with a few lines
  local wrote=""   # every mode deletes its output file before the run, so finding one means the agent did work
  for f in "$LOGDIR/$WP.pr.md" "$LOGDIR/$WP.reply.md" "$LOGDIR/$WP.report.md" "$LOGDIR/$WP.review.$AGENT.md"; do
    [[ -s $f ]] && wrote=1
  done
  if [[ -z $wrote ]] && (( SECONDS - t0 < 30 )) && (( $(wc -c <"$out") < 3000 )); then
    score no-run
    die "$AGENT stopped after $((SECONDS - t0))s without doing any work: probably not signed in or not configured. Owner: sudo -iu $(whoami) bash -c 'PATH=\$HOME/.local/bin:\$PATH $AGENT' and check it answers. Its output: $(tail -n 3 "$out" | tr '\n' ' ' | cut -c1-300)"
  fi
  # a CLI that lost its login often exits 0 after one error line, so check the end of the log either way
  # only a short log can be a logged-out CLI; a real run's output can quote "401" etc. in its own text
  if (( $(wc -c <"$out") < 3000 )) && ! grep -q '"status":"SUCCESS"' "$out" && tail -n 5 "$out" | grep -qiE "$AUTH_RE"; then
    score auth
    die "$AGENT is not signed in (or its login expired); nothing done. Owner: sudo -iu $(whoami) bash -c 'PATH=\$HOME/.local/bin:\$PATH $AGENT' and sign in again. Last line: $(tail -n 1 "$out" | cut -c1-200)"
  fi
  if (( rc != 0 )); then
    if tail -n 20 "$out" | grep -qiE "$LIMIT_RE"; then
      score limit
      # quote the provider's own words: they usually say when the limit resets
      die "$AGENT hit a rate or credit limit; nothing pushed (see $out). Its message: $(grep -iE "$LIMIT_RE" "$out" | tail -n 2 | tr '\n' ' ' | cut -c1-400)"
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
  bad=$(git -C "$dir" diff --name-only origin/develop...HEAD | grep -E "$FORBIDDEN_RE" | grep -vE "$ALLOWED_RE" || true)
  if [[ -n $bad ]]; then echo "forbidden paths changed:"; echo "$bad"; return 1; fi
  checks "$dir" || { echo "check/test failed: see $LOGDIR/$WP.check.log and $WP.test.log"; return 1; }
}

branch_for_wp() {
  git -C "$CLONE" ls-remote --heads origin "wp/$WP-*" | awk '{print $2}' | sed 's#refs/heads/##' | head -1
}

pr_for_branch() {
  # REST, not `gh pr list`: GraphQL PR queries can touch fields the repo-scoped token can't read
  gh api "repos/$REPO_SLUG/pulls?head=${REPO_SLUG%%/*}:$1&state=open" --jq '.[0].number // empty'
}

clean_worktree() {  # <dir>: abort any half-finished merge/rebase/cherry-pick and drop uncommitted changes
  local d=$1 g; g=$(git -C "$d" rev-parse --git-dir)
  [[ -e $g/MERGE_HEAD ]] && { log "aborting an unfinished merge in $d"; git -C "$d" merge --abort 2>/dev/null; }
  [[ -d $g/rebase-merge || -d $g/rebase-apply ]] && { log "aborting an unfinished rebase in $d"; git -C "$d" rebase --abort 2>/dev/null; }
  [[ -e $g/CHERRY_PICK_HEAD ]] && { log "aborting an unfinished cherry-pick in $d"; git -C "$d" cherry-pick --abort 2>/dev/null; }
  if [[ -n $(git -C "$d" status --porcelain --untracked-files=no) ]]; then
    log "dropping uncommitted changes in $d"; git -C "$d" reset -q --hard
  fi
}

pr_comment() {  # <file>: post a file as a comment on $PR (REST)
  retry gh api "repos/$REPO_SLUG/issues/$PR/comments" -F body=@"$1" --jq .html_url
}

retry git -C "$CLONE" fetch --quiet origin develop
git -C "$CLONE" worktree prune

# ---- ask: read-only investigation, report back ---------------------------
if [[ $MODE == ask ]]; then
  REF="${4:-develop}"
  [[ $REF =~ ^[A-Za-z0-9._/-]{1,100}$ ]] || die "bad ref: $REF"
  [[ $3 -ef $TASKFILE ]] || cp "$3" "$TASKFILE"
  REPORT="$LOGDIR/$WP.report.md"; rm -f "$REPORT"
  WT="$WT_ROOT/$WP-ask"
  [[ ! -e $WT ]] || git -C "$CLONE" worktree remove --force "$WT"
  retry git -C "$CLONE" fetch --quiet origin "+refs/heads/$REF:refs/remotes/origin/$REF" || die "can't fetch $REF"
  git -C "$CLONE" worktree add -q --detach "$WT" "origin/$REF"
  log "npm ci (failures are left for the agent to look at)"
  (cd "$WT" && npm ci --no-audit --no-fund >"$LOGDIR/$WP.npm.log" 2>&1) || log "npm ci failed (see $WP.npm.log)"
  ENVINFO=$(
    echo "host: $(uname -srm) · cpus: $(nproc) · node $(node -v 2>/dev/null) · npm $(npm -v 2>/dev/null)"
    free -h 2>/dev/null | sed -n '1,2p'
    df -h "$HOME" 2>/dev/null | tail -1 | awk '{print "disk ("$6"): "$4" free of "$2}'
    echo "checkout: origin/$REF @ $(git -C "$WT" rev-parse --short HEAD)"
  )
  PROMPT="You are the on-site investigator on the Sutaeru VPS. Claude, the project's reviewer, can't reach this machine,
so it sends you questions and diagnostic jobs and reads your report. Be its eyes and hands, and be exact.
The job is in $TASKFILE. Read it first.
Your working directory $WT is a throwaway detached checkout of origin/$REF; npm ci has run (its log:
$LOGDIR/$WP.npm.log). Logs of earlier agent runs are in $LOGDIR (for example <id>.check.log, <id>.test.log,
<id>.npm.log, <id>.<agent>.jsonl). Machine facts:
$ENVINFO
You may read any file you can and run any command you need: builds, tests, single test files, git log/diff, node -e,
free, df, ps. Prefer narrowing things down (rerun one failing test, bisect) over guessing.
Do NOT commit, push, open PRs or issues, use sudo, change anything outside $WT, or install global packages.
Edits inside $WT are allowed for experiments and are thrown away afterwards.
Never print or copy secrets: tokens, keys, passwords, .env contents, auth files under ~/.config or ~/.gemini.
Write your report to $REPORT in Markdown, under 300 lines, in this order:
1. Answer / root cause, in a few plain sentences, and how sure you are.
2. Evidence: the exact commands you ran and the relevant lines of output (trimmed).
3. Suggested fix or next step, as concrete as possible (file, change, command).
If you could not finish, say what you tried and what you would try next."
  run_agent "$WT" "$PROMPT" "$LOGDIR/$WP.$AGENT.ask.jsonl"
  git -C "$CLONE" worktree remove --force "$WT" || true
  { echo "<details><summary>Machine</summary>"; echo; echo '```'; echo "$ENVINFO"; echo '```'; echo "</details>"; echo
    if [[ -s $REPORT ]]; then cat "$REPORT"; else echo "**The agent wrote no report.** Last lines of its log:"; echo '```'
      tail -n 30 "$LOGDIR/$WP.$AGENT.ask.jsonl" 2>/dev/null; echo '```'; fi
  } > "$REPORT.tmp" && mv "$REPORT.tmp" "$REPORT"
  score report; log "done: report at $REPORT"
  exit 0
fi

# ---- build / task ----------------------------------------------------------
if [[ $MODE == build || $MODE == task ]]; then
  SLUG="${3:-}"; TITLE="${4:-}"
  [[ $SLUG =~ ^[a-z0-9-]+$ && -n $TITLE ]] || die "usage: $0 [task] <agent> <id> <slug> \"<title>\" [file]"
  if [[ $MODE == task ]]; then
    [[ $5 -ef $TASKFILE ]] || cp "$5" "$TASKFILE"
  fi
  BRANCH="wp/$WP-$SLUG"; WT="$WT_ROOT/$WP"
  [[ -z $(branch_for_wp) ]] || die "a wp/$WP-* branch already exists on origin; use 'fix'"
  if [[ -e $WT ]]; then
    # nothing was ever pushed for this id, so this is debris from an earlier failed run: start over
    log "removing stale $WT (no branch on origin)"
    git -C "$CLONE" worktree remove --force "$WT" 2>/dev/null || rm -rf -- "$WT"
    git -C "$CLONE" worktree prune
  fi
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
instruction with evidence) to $LOGDIR/$WP.pr.md. Evidence means commands you actually ran and their output.
You have no browser and no running app here: mark any manual or visual check you could not do as
NOT RUN (needs a person or a browser), never as verified. If the spec or instructions are wrong or impossible,
write that explanation to the same file instead and stop."
  rm -f "$LOGDIR/$WP.pr.md"
  run_agent "$WT" "$PROMPT" "$LOGDIR/$WP.$AGENT.jsonl"

  [[ -s $LOGDIR/$WP.pr.md ]] || { score red; die "agent wrote no PR body ($LOGDIR/$WP.pr.md); nothing pushed"; }
  if [[ $(git -C "$WT" rev-list --count origin/develop..HEAD) == 0 ]]; then
    score no-commits; cat "$LOGDIR/$WP.pr.md"; die "no commits; the agent's note is above"
  fi
  gate "$WT" || { score red; die "gate red; nothing pushed. Worktree kept at $WT (once the cause is fixed, mode: push publishes it without rerunning the agent)"; }
  retry git -C "$WT" push -q -u origin "$BRANCH"
  retry gh api "repos/$REPO_SLUG/pulls" -f base=develop -f head="$BRANCH" \
    -f title="[$WP] $TITLE" -F body=@"$LOGDIR/$WP.pr.md" --jq '"PR #\(.number): \(.html_url)"'
  score green; log "done: PR opened for $BRANCH"
  exit 0
fi

# ---- push: the agent finished but the gate stopped it; re-gate and push without running it again ----
if [[ $MODE == push ]]; then
  WT="$WT_ROOT/$WP"
  [[ -d $WT ]] || die "no kept worktree at $WT; nothing to push"
  clean_worktree "$WT"   # keeps commits; only clears an unfinished merge/rebase and uncommitted leftovers
  BRANCH=$(git -C "$WT" symbolic-ref --short HEAD) || die "$WT is not on a branch"
  [[ $BRANCH == wp/$WP-* ]] || die "$WT is on $BRANCH, expected wp/$WP-*"
  (( $(git -C "$WT" rev-list --count origin/develop..HEAD) > 0 )) || die "no commits on $BRANCH beyond develop; nothing to push"
  [[ -d $WT/node_modules ]] || (cd "$WT" && npm ci --no-audit --no-fund >"$LOGDIR/$WP.npm.log" 2>&1)
  if git -C "$CLONE" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then
    retry git -C "$WT" fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
    git -C "$WT" merge-base --is-ancestor "origin/$BRANCH" HEAD \
      || die "origin/$BRANCH has commits this worktree lacks; rerun 'fix' instead"
  fi
  log "re-running the gate on $WT"
  gate "$WT" || { score red; die "gate still red; nothing pushed. Worktree kept at $WT"; }
  retry git -C "$WT" push -q -u origin "$BRANCH"
  PR=$(pr_for_branch "$BRANCH")
  if [[ -n $PR ]]; then
    [[ -s $LOGDIR/$WP.reply.md ]] && pr_comment "$LOGDIR/$WP.reply.md"
    log "done: pushed to $BRANCH (PR #$PR)"
  else
    [[ -s $LOGDIR/$WP.pr.md ]] || die "pushed $BRANCH, but there is no PR body at $LOGDIR/$WP.pr.md to open a PR with"
    retry gh api "repos/$REPO_SLUG/pulls" -f base=develop -f head="$BRANCH" \
      -f title="[$WP] ${BRANCH#wp/$WP-}" -F body=@"$LOGDIR/$WP.pr.md" --jq '"PR #\(.number): \(.html_url)"'
    log "done: PR opened for $BRANCH"
  fi
  score green
  exit 0
fi

# ---- fix / review need an existing branch and PR ---------------------------
BRANCH=$(branch_for_wp); [[ -n $BRANCH ]] || die "no wp/$WP-* branch on origin"
PR=$(pr_for_branch "$BRANCH"); [[ -n $PR ]] || die "no open PR for $BRANCH"
FEEDBACK="$LOGDIR/$WP.feedback.md"
# REST only, each part best-effort: `gh pr view` also queries check status, which the token can't read
{
  echo "# Review feedback on PR #$PR"
  gh api "repos/$REPO_SLUG/pulls/$PR" --jq '"## \(.title)\n\n\(.body // "")"' || echo "(couldn't fetch the PR description)"
  echo; echo "## Reviews"
  gh api "repos/$REPO_SLUG/pulls/$PR/reviews" --paginate \
    --jq '.[] | select((.body // "") != "") | "- \(.user.login) [\(.state)]: \(.body)"' || echo "(couldn't fetch reviews)"
  echo; echo "## Conversation"
  gh api "repos/$REPO_SLUG/issues/$PR/comments" --paginate \
    --jq '.[] | "- \(.user.login): \(.body)"' || echo "(couldn't fetch comments)"
  echo; echo "## Inline review comments"
  gh api "repos/$REPO_SLUG/pulls/$PR/comments" --paginate \
    --jq '.[] | "- \(.path):\(.line // .original_line // "?") — \(.user.login): \(.body)"' || echo "(couldn't fetch inline comments)"
} > "$FEEDBACK"

if [[ $MODE == fix ]]; then
  WT="$WT_ROOT/$WP"
  retry git -C "$CLONE" fetch --quiet origin "$BRANCH"
  if [[ ! -e $WT ]]; then
    git -C "$CLONE" worktree add -q -B "$BRANCH" "$WT" "origin/$BRANCH"
  else
    # a run that died mid-way (limit, crash, watchdog) can leave a merge/rebase in progress or unpushed work;
    # GitHub's branch is the truth for a fix, so clear all of that and start from it
    clean_worktree "$WT"
    if ! git -C "$WT" merge --ff-only -q "origin/$BRANCH" 2>/dev/null; then
      log "discarding unpushed commits from an earlier failed run: $(git -C "$WT" log --oneline "origin/$BRANCH"..HEAD | tr '\n' ';')"
      git -C "$WT" reset -q --hard "origin/$BRANCH"
    fi
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
  gate "$WT" || { score red; die "gate red; nothing pushed. Worktree kept at $WT (once the cause is fixed, mode: push publishes it without rerunning the agent)"; }
  retry git -C "$WT" push -q origin "$BRANCH"
  [[ -s $LOGDIR/$WP.reply.md ]] && pr_comment "$LOGDIR/$WP.reply.md"
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
  > "$OUT.post" && pr_comment "$OUT.post"
git -C "$CLONE" worktree remove --force "$WT"
score green; log "done: review posted on PR #$PR"
