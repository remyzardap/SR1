#!/usr/bin/env bash
# One-shot VPS setup for the Sutaeru coding agents (kimi + agy), driven by GitHub issues.
# Run as root on the VPS. Safe to re-run: every step checks before it changes anything.
# Playbook: docs/spec/AGENT_OPS.md. What it does:
#   1. installs git, curl, jq, gh if missing
#   2. creates the unprivileged `agents` user (no docker group, no access to /root)
#   3. gives it Node 20+ in its own home if the system has none
#   4. installs kimi and agy for that user
#   5. logs gh in for that user with your GitHub token
#   6. clones the repo into /home/agents/sr1 and installs dispatch.sh + watch.sh
#   7. walks you through the kimi and agy sign-in (once)
#   8. starts the watcher as the systemd service `sutaeru-agents`
set -euo pipefail

REPO="${AGENTS_REPO:-remyzardap/SR1}"
BRANCH="${AGENTS_BRANCH:-claude/festive-curie-cta8mm}"
U=agents
H=/home/$U
TTY=/dev/tty

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    %s\n' "$*"; }
die()  { printf '\n\033[31mSetup stopped: %s\033[0m\n' "$*" >&2; exit 1; }
as_u() { su - "$U" -c "export PATH=\$HOME/.local/bin:\$PATH; $1"; }

[[ $EUID -eq 0 ]] || die "run this as root (sudo -i first)"

# ---------------------------------------------------------------------------
say "1/8 System tools (git, curl, jq, gh)"
missing=()
for p in git curl jq gh; do command -v "$p" >/dev/null || missing+=("$p"); done
if (( ${#missing[@]} )); then
  command -v apt-get >/dev/null || die "please install: ${missing[*]} (no apt-get on this system)"
  if [[ " ${missing[*]} " == *" gh "* ]] && ! apt-cache show gh >/dev/null 2>&1; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list
  fi
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}"
fi
for p in git curl jq gh; do command -v "$p" >/dev/null || die "$p did not install"; done
ok "all present"

# ---------------------------------------------------------------------------
say "2/8 The 'agents' user"
id "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash "$U"
if id -nG "$U" | tr ' ' '\n' | grep -qx docker; then gpasswd -d "$U" docker >/dev/null; ok "removed from docker group"; fi
chmod 700 /root
grep -q 'HOME/.local/bin' "$H/.profile" 2>/dev/null || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$H/.profile"
mkdir -p "$H/.local/bin"; chown -R "$U:$U" "$H/.local" "$H/.profile"
ok "user ready; it cannot read /root (where .env and secrets live) or use docker"

# ---------------------------------------------------------------------------
say "3/8 Node.js 20+ for the agents user"
node_major=$(as_u 'node -v 2>/dev/null' | sed -n 's/^v\([0-9]*\).*/\1/p' || true)
if [[ -z $node_major || $node_major -lt 20 ]]; then
  case $(uname -m) in x86_64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) die "unsupported CPU $(uname -m)" ;; esac
  file=$(curl -fsSL https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt | grep -o "node-v[0-9.]*-linux-$arch.tar.xz" | head -1)
  [[ -n $file ]] || die "could not find a Node 20 download"
  as_u "rm -rf ~/.local/node && mkdir -p ~/.local/node && curl -fsSL https://nodejs.org/dist/latest-v20.x/$file | tar -xJ -C ~/.local/node --strip-components=1 && ln -sf ~/.local/node/bin/node ~/.local/node/bin/npm ~/.local/node/bin/npx ~/.local/bin/"
fi
ok "node $(as_u 'node -v')"

# ---------------------------------------------------------------------------
say "4/8 kimi and agy for the agents user"
as_u 'command -v kimi >/dev/null || curl -LsSf https://code.kimi.com/install.sh | bash' >/dev/null
as_u 'command -v agy  >/dev/null || curl -fsSL https://antigravity.google/cli/install.sh | bash' >/dev/null
as_u 'command -v kimi >/dev/null' || die "kimi did not install; try as the agents user: curl -LsSf https://code.kimi.com/install.sh | bash"
as_u 'command -v agy  >/dev/null' || die "agy did not install; try as the agents user: curl -fsSL https://antigravity.google/cli/install.sh | bash"
ok "kimi: $(as_u 'kimi --version 2>&1 | head -1')"
ok "agy:  $(as_u 'agy --version 2>&1 | head -1')"

# ---------------------------------------------------------------------------
say "5/8 GitHub login for the agents user"
if ! as_u "gh api repos/$REPO -q .name" >/dev/null 2>&1; then
  token="${GH_TOKEN_FOR_AGENTS:-}"
  if [[ -z $token ]]; then
    echo "    Paste a GitHub fine-grained token for $REPO (Contents, Issues, Pull requests: read and write)."
    read -r -s -p "    Token: " token <"$TTY"; echo
  fi
  [[ -n $token ]] || die "no token given"
  printf '%s\n' "$token" | as_u 'gh auth login --with-token' || die "GitHub did not accept that token"
  unset token
fi
as_u 'gh auth setup-git' >/dev/null
as_u "gh api repos/$REPO -q .name" >/dev/null || die "the token cannot see $REPO"
ok "gh can reach $REPO"

# ---------------------------------------------------------------------------
say "6/8 Repo clone and the agent scripts"
[[ -d $H/sr1/.git ]] || as_u "gh repo clone $REPO ~/sr1 -- -q"
as_u "cd ~/sr1 && git config user.name sutaeru-agents && git config user.email agents@sutaeru.invalid \
  && git fetch -q origin develop '$BRANCH' \
  && for f in dispatch.sh watch.sh; do git show 'origin/$BRANCH:ops/agents/'\$f > ~/\$f && chmod 755 ~/\$f; done \
  && mkdir -p ~/wt ~/agent-logs"
ok "installed $H/dispatch.sh and $H/watch.sh from $BRANCH"

# ---------------------------------------------------------------------------
say "7/8 Sign in to kimi and agy (one time)"
signin() {  # <cli> <how to finish>
  local a
  read -r -p "    Open $1 now to sign in? [Y/n] " a <"$TTY"
  [[ $a =~ ^[Nn] ]] && { ok "skipped $1 (run later: sudo -iu agents $1)"; return; }
  echo "    $2"
  as_u "$1" <"$TTY" >"$TTY" 2>&1 || true
}
signin kimi "In kimi: type /login, finish in the browser link it shows, then type /exit."
signin agy  "In agy: complete the Google sign-in it shows, then exit (/exit or Ctrl+D)."

# ---------------------------------------------------------------------------
say "8/8 Watcher service"
cat > /etc/systemd/system/sutaeru-agents.service <<UNIT
[Unit]
Description=Sutaeru agent watcher (GitHub issues -> kimi/agy)
After=network-online.target
Wants=network-online.target

[Service]
User=$U
WorkingDirectory=$H
Environment=PATH=$H/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$H/watch.sh
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q sutaeru-agents
systemctl restart sutaeru-agents
sleep 3
systemctl is-active -q sutaeru-agents || die "the service did not start; see: journalctl -u sutaeru-agents -n 50"
ok "running"

cat <<DONE

Setup complete.
  Watch it:   journalctl -u sutaeru-agents -f
  Test kimi:  sudo -iu agents kimi --print -p "say hi"
  Test agy:   sudo -iu agents agy -p "say hi"
Last step, on github.com/$REPO → Settings → Branches: protect main and develop
(require a pull request and the check, test, db-tests checks; block force pushes).
Then tell Claude "the watcher is running".
DONE
