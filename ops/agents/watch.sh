#!/usr/bin/env bash
# Picks up agent tasks from GitHub issues and runs them with dispatch.sh, so Claude (or you) can command
# kimi, agy and qwen by opening an issue. Playbook: docs/spec/AGENT_OPS.md §4.5. Run as the `agents` user.
#
# An issue is a task only if ALL of these hold:
#   - it is open, labelled `agent-task`, and opened by one of OWNER_LOGIN, a comma-separated list
#     (default remyzardap,claude[bot]); a name ending in [bot] only matches a GitHub App bot, never a person
#   - its body has these lines (anything else in the body is ignored):
#       agent: kimi | agy | qwen
#       mode:  build | fix | review | task
#       wp:    P1-03                (not for task: a task's id is T-<issue number>; fix/review take T-ids)
#       slug:  streaming            (build and task)
#       title: Stream every turn    (build and task)
#   for mode task, the coding instructions are everything below the first line that is exactly ---
# The watcher labels it `agent-running`, runs dispatch.sh, comments the outcome, then labels it
# `agent-done` (and closes it) or `agent-failed`. Re-add `agent-task` after removing `agent-failed` to retry.
set -uo pipefail

REPO_SLUG="${REPO_SLUG:-remyzardap/SR1}"
OWNER_LOGIN="${OWNER_LOGIN:-remyzardap,claude[bot]}"
DISPATCH="${DISPATCH:-$HOME/dispatch.sh}"
LOGDIR="${AGENTS_LOGS:-$HOME/agent-logs}"
MAX_AGENTS="${MAX_AGENTS:-2}"
INTERVAL="${WATCH_INTERVAL:-60}"

log() { echo "[$(date '+%F %T')] $*"; }
[[ $EUID -ne 0 ]] || { echo "refusing to run as root" >&2; exit 1; }
mkdir -p "$LOGDIR/running" "$LOGDIR/tasks"

# OWNER_LOGIN as a jq array literal; names are checked so nothing odd reaches the jq program
ALLOW_JSON=""
IFS=, read -ra _owners <<<"$OWNER_LOGIN"
for o in "${_owners[@]}"; do
  o="${o// /}"; [[ -n $o ]] || continue
  [[ $o =~ ^[A-Za-z0-9-]+(\[bot\])?$ ]] || { echo "bad name in OWNER_LOGIN: $o" >&2; exit 1; }
  ALLOW_JSON+="${ALLOW_JSON:+,}\"$o\""
done
[[ -n $ALLOW_JSON ]] || { echo "OWNER_LOGIN is empty" >&2; exit 1; }
# gh reports bots as login "app/<name>" or "<name>[bot]" with is_bot true; people never match a [bot] entry
AUTHOR_OK="(.author // {}) as \$a | ((\$a.login // \"\") | sub(\"^app/\"; \"\") | sub(\"\\\\[bot\\\\]\$\"; \"\")) as \$l
  | any([$ALLOW_JSON][]; if endswith(\"[bot]\") then ((\$a.is_bot // false) and .[:-5] == \$l)
                         else ((\$a.is_bot // false) | not) and . == \$l end)"

ensure_labels() {
  gh label create agent-task    --repo "$REPO_SLUG" --color 1D76DB --description "Task for kimi/agy/qwen on the VPS" --force >/dev/null
  gh label create agent-running --repo "$REPO_SLUG" --color FBCA04 --description "An agent is working on it" --force >/dev/null
  gh label create agent-done    --repo "$REPO_SLUG" --color 0E8A16 --description "Agent finished; gate green" --force >/dev/null
  gh label create agent-failed  --repo "$REPO_SLUG" --color B60205 --description "Agent run failed; see comment" --force >/dev/null
}

running_count() {
  local n=0 f
  for f in "$LOGDIR"/running/*.pid; do
    [[ -e $f ]] || continue
    kill -0 "$(cat "$f")" 2>/dev/null && n=$((n + 1))
  done
  echo "$n"
}

field() {  # <name> <body>: value of a "name: value" line
  sed -n "s/^[[:space:]]*$1:[[:space:]]*//p" <<<"$2" | head -1 | tr -d '\r' | sed 's/[[:space:]]*$//'
}

run_task() {  # <issue> <agent> <mode> <wp> <slug> <title>
  local n=$1 agent=$2 mode=$3 wp=$4 slug=$5 title=$6 out="$LOGDIR/tasks/issue-$1.log" rc=0
  if [[ $mode == build ]]; then
    "$DISPATCH" "$agent" "$wp" "$slug" "$title" >"$out" 2>&1 || rc=$?
  elif [[ $mode == task ]]; then
    "$DISPATCH" task "$agent" "$wp" "$slug" "$title" "$LOGDIR/tasks/issue-$n.task.md" >"$out" 2>&1 || rc=$?
  else
    "$DISPATCH" "$mode" "$agent" "$wp" >"$out" 2>&1 || rc=$?
  fi
  # dispatch.sh prints only its own status lines; agent transcripts stay in $LOGDIR on the VPS.
  local body
  body=$(printf '%s %s **%s** with `%s` on the VPS: **%s** (exit %s)\n\n```\n%s\n```\n' \
    "$([[ $rc == 0 ]] && echo ✅ || echo ❌)" "$wp" "$mode" "$agent" \
    "$([[ $rc == 0 ]] && echo done || echo failed)" "$rc" "$(tail -n 25 "$out")")
  gh issue comment "$n" --repo "$REPO_SLUG" --body "$body" >/dev/null
  if [[ $rc == 0 ]]; then
    gh issue edit "$n" --repo "$REPO_SLUG" --remove-label agent-running --add-label agent-done >/dev/null
    gh issue close "$n" --repo "$REPO_SLUG" >/dev/null
  else
    gh issue edit "$n" --repo "$REPO_SLUG" --remove-label agent-running --add-label agent-failed >/dev/null
  fi
  log "issue #$n finished rc=$rc"
}

reject() {  # <issue> <reason>
  gh issue comment "$1" --repo "$REPO_SLUG" --body "❌ Not started: $2 (see docs/spec/AGENT_OPS.md §4.5 for the format)" >/dev/null
  gh issue edit "$1" --repo "$REPO_SLUG" --remove-label agent-task --add-label agent-failed >/dev/null
  log "issue #$1 rejected: $2"
}

tick() {
  local free issues n body agent mode wp slug title
  free=$(( MAX_AGENTS - $(running_count) ))
  (( free > 0 )) || return 0
  issues=$(gh issue list --repo "$REPO_SLUG" --state open --label agent-task \
    --limit 50 --json number,labels,author \
    --jq "[.[] | select($AUTHOR_OK) | select([.labels[].name] | index(\"agent-running\") or index(\"agent-done\") or index(\"agent-failed\") | not)] | sort_by(.number) | .[].number") \
    || { log "gh issue list failed"; return 0; }
  for n in $issues; do
    (( free > 0 )) || break
    body=$(gh issue view "$n" --repo "$REPO_SLUG" --json body --jq .body) || continue
    agent=$(field agent "$body"); mode=$(field mode "$body"); wp=$(field wp "$body")
    slug=$(field slug "$body");   title=$(field title "$body")
    [[ $agent =~ ^(kimi|agy|qwen)$ ]] || { reject "$n" "agent must be kimi, agy or qwen"; continue; }
    [[ $mode =~ ^(build|fix|review|task)$ ]] || { reject "$n" "mode must be build, fix, review or task"; continue; }
    if [[ $mode == task ]]; then
      wp="T-$n"
      awk 'f; /^---[[:space:]]*$/ && !f {f=1}' <<<"$body" | tr -d '\r' >"$LOGDIR/tasks/issue-$n.task.md"
      [[ -n $(tr -d '[:space:]' <"$LOGDIR/tasks/issue-$n.task.md") ]] \
        || { reject "$n" "task instructions missing: put them below a line that is exactly ---"; continue; }
    fi
    [[ $wp =~ ^(P[1-4]-[0-9]{2}|F-[0-9]{2}|T-[0-9]{1,6})$ ]] || { reject "$n" "wp must look like P1-03, F-01 or T-12"; continue; }
    [[ $mode != build || $wp != T-* ]] || { reject "$n" "T- ids are started with mode: task"; continue; }
    if [[ $mode == build || $mode == task ]]; then
      [[ $slug =~ ^[a-z0-9-]{1,40}$ ]] || { reject "$n" "slug must be lowercase letters, digits and dashes"; continue; }
      [[ -n $title && ${#title} -le 120 ]] || { reject "$n" "title is missing or too long"; continue; }
    fi
    gh issue edit "$n" --repo "$REPO_SLUG" --add-label agent-running >/dev/null || continue
    gh issue comment "$n" --repo "$REPO_SLUG" --body "🛠️ Picked up: $wp $mode with \`$agent\`. I'll comment here when it finishes." >/dev/null
    log "issue #$n: $agent $mode $wp"
    run_task "$n" "$agent" "$mode" "$wp" "$slug" "$title" &
    free=$((free - 1))
    sleep 5   # let dispatch.sh register its pid before the next count
  done
}

ensure_labels || log "could not create labels (check gh auth); continuing"
log "watching $REPO_SLUG for agent-task issues by $OWNER_LOGIN every ${INTERVAL}s"
if [[ ${1:-} == --once ]]; then tick; wait; exit 0; fi
while true; do tick; sleep "$INTERVAL"; done
