#!/usr/bin/env bash
# One-command VPS setup so Claude can command qwen, agy, kimi and opencode through GitHub issues.
# Does everything in docs/spec/AGENT_OPS.md §3 and is safe to re-run (re-running also updates the scripts).
#
#   sudo bash ops/agents/install.sh          from a checkout that has this file, e.g. /root/sr1, or straight from git:
#   git -C /root/sr1 fetch -q origin develop && git -C /root/sr1 show FETCH_HEAD:ops/agents/install.sh | sudo bash
#
# It asks once for a fine-grained GitHub token (this repo only; Contents + Pull requests + Issues: read/write),
# unless GH_TOKEN is set or the agents user is already signed in to gh.
# Options (env): AGENTS_USER=agents  REPO_SLUG=remyzardap/SR1  SCRIPTS_REF=<branch the scripts come from>
#                OWNER_LOGIN=remyzardap,claude[bot]  (comma list of who may open tasks; [bot] names match only bots)
set -euo pipefail

AGENTS_USER="${AGENTS_USER:-agents}"
REPO_SLUG="${REPO_SLUG:-remyzardap/SR1}"
SCRIPTS_REF="${SCRIPTS_REF:-develop}"
OWNER_LOGIN="${OWNER_LOGIN:-${REPO_SLUG%%/*},claude[bot]}"   # who may open agent-task issues
BIN_DIR=/opt/sutaeru-agents          # root-owned, so an agent can't rewrite its own gate
UNIT=/etc/systemd/system/sutaeru-agents.service

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31mxx  %s\033[0m\n' "$*" >&2; exit 1; }
as_agents() { sudo -u "$AGENTS_USER" -H bash -lc "cd ~ && $1"; }

[[ $EUID -eq 0 ]] || die "run as root: sudo bash $0"
command -v systemctl >/dev/null || die "systemd is required"

say "1/7 packages (git, gh, node)"
need=()
command -v git >/dev/null || need+=(git)
command -v gh  >/dev/null || need+=(gh)
command -v jq  >/dev/null || need+=(jq)
command -v sudo >/dev/null || need+=(sudo)
if ((${#need[@]})); then
  command -v apt-get >/dev/null || die "install these first: ${need[*]}"
  apt-get update -qq && apt-get install -y -qq "${need[@]}"
fi
command -v npm >/dev/null || warn "npm not found; agents need Node.js + npm to run check/test (install Node 20+)"

say "2/7 user '$AGENTS_USER' (no root, no docker, no secrets)"
id "$AGENTS_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$AGENTS_USER"
if id -nG "$AGENTS_USER" | tr ' ' '\n' | grep -qx docker; then
  gpasswd -d "$AGENTS_USER" docker >/dev/null && echo "removed $AGENTS_USER from the docker group (docker = root)"
fi
chmod 700 /root
HOME_DIR=$(getent passwd "$AGENTS_USER" | cut -d: -f6)

say "3/7 GitHub sign-in for '$AGENTS_USER'"
if as_agents "gh repo view '$REPO_SLUG' --json name" >/dev/null 2>&1 && [[ -z ${GH_TOKEN:-} ]]; then
  echo "already signed in"
else
  token="${GH_TOKEN:-}"
  if [[ -z $token ]]; then
    [[ -r /dev/tty ]] || die "no terminal to ask for a token; re-run with GH_TOKEN=... set"
    echo "Paste a fine-grained token for $REPO_SLUG only"
    echo "(github.com/settings/personal-access-tokens/new; Contents, Pull requests, Issues: read and write)"
    read -rsp "token: " token </dev/tty; echo
  fi
  token=$(printf '%s' "$token" | tr -d '[:space:]')   # pasted tokens often carry a newline or spaces
  [[ -n $token ]] || die "empty token"
  [[ $token =~ ^(github_pat_|ghp_)[A-Za-z0-9_]+$ ]] \
    || die "that doesn't look like a GitHub token (should start with github_pat_ and contain only letters, digits and _): check the paste"
  printf '%s\n' "$token" | sudo -u "$AGENTS_USER" -H gh auth login --hostname github.com --with-token
  unset token
fi
as_agents 'gh auth setup-git' >/dev/null
as_agents "gh repo view '$REPO_SLUG' --json name >/dev/null" || die "the token can't see $REPO_SLUG"

say "4/7 the agents' own clone (~$AGENTS_USER/sr1, separate from production)"
as_agents "
  set -e
  mkdir -p ~/wt ~/agent-logs
  [[ -d ~/sr1/.git ]] || gh repo clone '$REPO_SLUG' ~/sr1 -- --quiet
  git -C ~/sr1 config user.name  sutaeru-agents
  git -C ~/sr1 config user.email agents@sutaeru.invalid
  # explicit refspecs: a single-branch clone would otherwise leave origin/<ref> missing
  git -C ~/sr1 fetch --quiet origin '+refs/heads/$SCRIPTS_REF:refs/remotes/origin/$SCRIPTS_REF' \\
    '+refs/heads/develop:refs/remotes/origin/develop'
"

say "5/7 install dispatch.sh and watch.sh from '$SCRIPTS_REF' into $BIN_DIR"
install -d -m 755 "$BIN_DIR"
for f in dispatch.sh watch.sh; do
  # read as the agents user: root running git in a repo it does not own trips "dubious ownership"
  sudo -u "$AGENTS_USER" -H git -c safe.directory="$HOME_DIR/sr1" -C "$HOME_DIR/sr1" show "origin/$SCRIPTS_REF:ops/agents/$f" >"$BIN_DIR/$f.new" \
    || die "ops/agents/$f is not on $SCRIPTS_REF; re-run with SCRIPTS_REF=<branch that has it>"
  bash -n "$BIN_DIR/$f.new" || die "$f has a syntax error on $SCRIPTS_REF"
  install -m 755 -o root -g root "$BIN_DIR/$f.new" "$BIN_DIR/$f" && rm -f "$BIN_DIR/$f.new"
done
# how many agent runs may go at once; the watcher re-reads this file every minute, so edit it any time
if [[ -n ${MAX_AGENTS:-} || ! -s $BIN_DIR/max_agents ]]; then
  echo "${MAX_AGENTS:-4}" >"$BIN_DIR/max_agents"; chmod 644 "$BIN_DIR/max_agents"
fi
echo "parallel agent runs: $(cat "$BIN_DIR/max_agents")   (change: echo 3 | sudo tee $BIN_DIR/max_agents)"
ln -sfn "$BIN_DIR/dispatch.sh" "$HOME_DIR/dispatch.sh"   # so `sudo -iu agents ~/dispatch.sh ...` works by hand
chown -h "$AGENTS_USER": "$HOME_DIR/dispatch.sh"

say "6/7 install the coding agents (qwen, agy, kimi, opencode) for '$AGENTS_USER'"
# All go in ~agents/.local/bin; no root, no system packages touched. Already installed = left alone
# (set AGENTS_UPGRADE=1 to update them). A failure here is a warning, not fatal: one agent is enough.
QWEN_PKG="${QWEN_PKG:-@qwen-code/qwen-code}"
AGY_INSTALL_URL="${AGY_INSTALL_URL:-https://antigravity.google/cli/install.sh}"
KIMI_INSTALL_URL="${KIMI_INSTALL_URL:-https://code.kimi.com/install.sh}"
OPENCODE_PKG="${OPENCODE_PKG:-opencode-ai}"
has_cli() { [[ -z ${AGENTS_UPGRADE:-} ]] && as_agents "export PATH=\"\$HOME/.local/bin:\$PATH\"; command -v $1" >/dev/null; }
as_agents 'mkdir -p ~/.local/bin'
if [[ -n ${AGENTS_UPGRADE:-} ]] || ! as_agents 'export PATH="$HOME/.local/bin:$PATH"; command -v qwen' >/dev/null; then
  if command -v npm >/dev/null; then
    echo "installing qwen ($QWEN_PKG)"
    as_agents "npm install -g --prefix \"\$HOME/.local\" --no-audit --no-fund '$QWEN_PKG'" || warn "qwen install failed (see above)"
  else
    warn "npm missing, can't install qwen"
  fi
fi
if [[ -n ${AGENTS_UPGRADE:-} ]] || ! as_agents 'export PATH="$HOME/.local/bin:$PATH"; command -v agy' >/dev/null; then
  echo "installing agy ($AGY_INSTALL_URL)"
  as_agents "set -o pipefail; curl -fsSL '$AGY_INSTALL_URL' | bash" || warn "agy install failed (see above)"
fi
if ! has_cli kimi; then
  echo "installing kimi ($KIMI_INSTALL_URL)"
  as_agents "set -o pipefail; curl -LsSf '$KIMI_INSTALL_URL' | bash" || warn "kimi install failed (see above)"
fi
if ! has_cli opencode; then
  echo "installing opencode (npm $OPENCODE_PKG)"
  as_agents "npm install -g --prefix \"\$HOME/.local\" --no-audit --no-fund '$OPENCODE_PKG'" || warn "opencode install failed (see above)"
fi
# opencode asks before edits/commands unless its config allows them; agents run unattended (the gate is the check)
as_agents 'f=~/.config/opencode/opencode.json; mkdir -p ~/.config/opencode; [ -s "$f" ] || echo "{}" > "$f"
  jq ". + {\"\$schema\": \"https://opencode.ai/config.json\"} | .permission = ((.permission // {}) + {\"edit\": \"allow\", \"bash\": \"allow\", \"webfetch\": \"allow\", \"external_directory\": \"allow\"})" "$f" > "$f.tmp" && mv "$f.tmp" "$f"'
AGENT_PATH=$(as_agents 'echo "$HOME/.local/bin:$HOME/bin:$PATH"')
missing=()
for cli in qwen agy kimi opencode; do
  if p=$(as_agents "export PATH=\"\$HOME/.local/bin:\$PATH\"; command -v $cli"); then
    echo "$cli: $p"; AGENT_PATH="$(dirname "$p"):$AGENT_PATH"
  else
    missing+=("$cli")
  fi
done
((${#missing[@]} < 4)) || warn "no coding agent got installed for $AGENTS_USER; fix the errors above and re-run"

say "7/7 watcher service"
cat >"$UNIT" <<UNIT_EOF
[Unit]
Description=Sutaeru agent watcher (GitHub issues -> qwen/agy/kimi/opencode)
After=network-online.target
Wants=network-online.target
[Service]
User=$AGENTS_USER
WorkingDirectory=$HOME_DIR
Environment=PATH=$AGENT_PATH
Environment=DISPATCH=$BIN_DIR/dispatch.sh
Environment=REPO_SLUG=$REPO_SLUG
Environment=OWNER_LOGIN=$OWNER_LOGIN
ExecStart=$BIN_DIR/watch.sh
Restart=always
# restarting the watcher (e.g. re-running this script) must not kill agent runs in progress
KillMode=process
RestartSec=30
[Install]
WantedBy=multi-user.target
UNIT_EOF
systemctl daemon-reload
systemctl enable --quiet sutaeru-agents
systemctl restart sutaeru-agents
sleep 3
systemctl is-active --quiet sutaeru-agents || { journalctl -u sutaeru-agents -n 20 --no-pager; die "watcher did not start"; }

say "done: the watcher is running"
journalctl -u sutaeru-agents -n 3 --no-pager -o cat || true
cat <<EOF

Still to do by hand (only once):
EOF
for cli in qwen agy kimi opencode; do
  if [[ " ${missing[*]} " == *" $cli "* ]]; then
    echo "  - $cli: not installed (see the warning above)"
  else
    echo "  - sign $cli in:   sudo -iu $AGENTS_USER bash -c 'PATH=\$HOME/.local/bin:\$PATH $cli'"
  fi
done
echo "      qwen: /auth, pick your plan (or set the key in ~/.qwen/.env), /quit.   agy: open the link it prints, sign in, paste the code."
echo "      kimi: type /login, finish in the browser, /exit.   opencode: run 'opencode auth login' instead (same sudo prefix), pick a provider."
echo "  - then: systemctl restart sutaeru-agents"
cat <<EOF
  - on GitHub, protect main and develop (Settings > Branches): require a PR and the check/test checks

Follow it:   journalctl -u sutaeru-agents -f
Command it:  open an issue labelled agent-task (docs/spec/AGENT_OPS.md §4.5), or ask Claude to.
EOF
