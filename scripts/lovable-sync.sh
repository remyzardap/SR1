#!/usr/bin/env bash
# Two-way sync between the repo (/root/sr1) and Lovable's workspace (/opt/sutaeru-lovable).
#
#   scripts/lovable-sync.sh status                 what differs, by owner
#   scripts/lovable-sync.sh to-lovable [--client]  repo -> workspace (backend, docs; client/ only with --client)
#   scripts/lovable-sync.sh from-lovable           workspace -> repo (client/, package files, handoff doc)
#
# Ownership: Lovable owns client/. Claude Code owns everything else.
# Only git-tracked repo files ever go to the workspace, so .env and secrets never travel.
# Every run that writes takes a backup of the side it overwrites in /root/backups/.
set -euo pipefail

REPO="${REPO:-/root/sr1}"
WS="${WS:-/opt/sutaeru-lovable}"
BACKUPS=/root/backups
LOVABLE_PATHS=(client docs/LOVABLE_HANDOFF.md package.json package-lock.json)
cmd="${1:-status}"; shift || true

differs() { # $1 = path relative to both roots
  [ -e "$REPO/$1" ] || [ -e "$WS/$1" ] || return 1
  ! diff -rq -x node_modules -x dist "$REPO/$1" "$WS/$1" >/dev/null 2>&1
}
backup() { # $1 = dir to back up, $2 = label
  mkdir -p "$BACKUPS"; cp -a "$1" "$BACKUPS/$2-$(date +%Y%m%d-%H%M%S)"
}

case "$cmd" in
  status)
    echo "Lovable-owned (client, package files, handoff doc):"
    for p in "${LOVABLE_PATHS[@]}"; do
      if differs "$p"; then
        echo "  DIFFERS  $p"; { diff -rq -x node_modules -x dist "$REPO/$p" "$WS/$p" 2>&1 || true; } | sed 's/^/           /' | sed -n '1,8p'
      else echo "  same     $p"; fi
    done
    echo "Claude-owned (everything else, tracked files only):"
    n=$(cd "$REPO" && git ls-files | grep -v -E '^(client/|docs/LOVABLE_HANDOFF.md$|package(-lock)?\.json$)' \
        | while read -r f; do cmp -s "$REPO/$f" "$WS/$f" 2>/dev/null || echo "$f"; done | wc -l)
    echo "  $n tracked file(s) differ"
    ;;
  from-lovable)
    [ "$(cd "$REPO" && git rev-parse --abbrev-ref HEAD)" != "main" ] || { echo "Refusing: repo is on main. Check out a branch first." >&2; exit 1; }
    [ -z "$(cd "$REPO" && git status --porcelain -- "${LOVABLE_PATHS[@]}")" ] || { echo "Refusing: uncommitted changes in Lovable-owned paths in the repo. Commit them first." >&2; exit 1; }
    backup "$REPO/client" repo-client-before-from-lovable
    rsync -a --delete --exclude=node_modules "$WS/client/" "$REPO/client/"
    for f in docs/LOVABLE_HANDOFF.md package.json package-lock.json; do [ -e "$WS/$f" ] && cp "$WS/$f" "$REPO/$f"; done
    echo "Copied from workspace. Review with: git -C $REPO diff --stat"
    echo "Next: cd $REPO && npm install && npm run build, then commit."
    ;;
  to-lovable)
    with_client=0; [ "${1:-}" = "--client" ] && with_client=1
    if [ $with_client = 0 ] && differs client; then echo "Note: client/ differs and is being left alone (Lovable owns it). Use --client to overwrite after running from-lovable."; fi
    backup "$WS" workspace-before-to-lovable
    excl=(-e 'client/*' -e docs/LOVABLE_HANDOFF.md -e package.json -e package-lock.json)
    (cd "$REPO" && git ls-files -z) | { if [ $with_client = 1 ]; then cat; else xargs -0 -n1 printf '%s\0' | grep -z -v -E '^(client/|docs/LOVABLE_HANDOFF.md$|package(-lock)?\.json$)'; fi; } \
      | rsync -a --from0 --files-from=- "$REPO/" "$WS/"
    # Handoff doc: repo copy wins only if the workspace copy is not newer, so neither side's log lines are lost.
    if [ "$REPO/docs/LOVABLE_HANDOFF.md" -nt "$WS/docs/LOVABLE_HANDOFF.md" ]; then cp "$REPO/docs/LOVABLE_HANDOFF.md" "$WS/docs/LOVABLE_HANDOFF.md"; else echo "Handoff doc in workspace is newer; kept it. Run from-lovable to pull it."; fi
    chown -R 1001:1001 "$WS"
    echo "Copied to workspace."
    ;;
  *) echo "usage: $0 status|to-lovable [--client]|from-lovable" >&2; exit 2 ;;
esac
