#!/usr/bin/env python3
"""Sutaeru Code sessions daemon.

Runs headless Claude Code on this VPS and exposes a small token-protected HTTP API
(bound to the docker bridge) that Sutaeru's server calls. Events are persisted to
/root/session-data/<id>/events.jsonl so the phone can reconnect at any time.

Provider chain (in order, switching automatically on limit/credit errors):
  /root/.session_providers.json  -> [{"name","kind":"anthropic"|"anthropic-compatible", ...}]
Secrets are read at spawn time and never logged or returned.
"""
import base64, json, os, re, signal, subprocess, threading, time, uuid, hmac, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BIND = os.environ.get("SESSION_BIND", "172.18.0.1")
PORT = int(os.environ.get("SESSION_PORT", "8789"))
DATA = os.environ.get("SESSION_DATA", "/root/session-data")
TOKEN = os.environ.get("SESSION_TOKEN") or (open("/root/.session_manager_token").read().strip() if os.path.exists("/root/.session_manager_token") else "")
PROVIDERS_FILE = "/root/.session_providers.json"
DEFAULT_CWD = "/root/sr1"
DEFAULT_BUDGET = float(os.environ.get("SESSION_BUDGET_USD", "0"))  # 0 = no spend cap
FULL_SESSION_TIMEOUT = int(os.environ.get("SESSION_FULL_TIMEOUT", "1800"))
MAX_ATTACH_FILE_BYTES = 10 * 1024 * 1024
MAX_ATTACH_TOTAL_BYTES = 20 * 1024 * 1024
MAX_RUNNING = 3
LIMIT_RE = re.compile(
    r"rate.?limit|usage limit|credit balance|insufficient|quota|overloaded|billing|"
    r"out of (credits|tokens)|limit reached|429|402|too many requests|exceeded your",
    re.I,
)
# Never let a session read secrets, even if approved by mistake.
ALWAYS_DENY = [
    "Read(//root/sr1/.env)", "Read(//root/sr1/secrets/**)", "Read(//root/.ssh/**)",
    "Read(//root/.anthropic_key)", "Read(//root/.jarvis_key)", "Read(//root/.gpu_manager_token)",
    "Read(//root/.session_manager_token)", "Read(//root/.session_providers.json)",
    "Read(//root/.secrets/**)", "Read(//root/.claude/.credentials.json)",
    "Edit(//root/sr1/.env)", "Edit(//root/.ssh/**)", "Edit(//root/session-manager/**)",
    "Bash(cat /root/sr1/.env*)", "Bash(*.env*)", "Bash(*/.ssh/*)", "Bash(*_key*)",
    "Bash(*session_providers*)", "Bash(rm -rf /*)", "Bash(shutdown*)", "Bash(reboot*)",
    "Bash(systemctl stop*)", "Bash(docker compose down*)",
]
SAFE_BASH = [
    "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)", "Bash(git show*)",
    "Bash(ls*)", "Bash(pwd)", "Bash(npm test*)", "Bash(npx tsc*)", "Bash(npx vitest*)",
    "Bash(docker ps*)", "Bash(docker logs*)", "Bash(df*)", "Bash(free*)", "Bash(uptime)",
]
MODES = {
    # read-only: look around, answer questions
    "read": ["--permission-mode", "default", "--allowedTools", "Read,Glob,Grep,WebFetch,WebSearch"],
    # edit: edits auto-allowed, safe shell commands allowed; everything else becomes an approval card
    "edit": ["--permission-mode", "acceptEdits", "--allowedTools",
             ",".join(["Read", "Glob", "Grep", "WebFetch", "WebSearch"] + SAFE_BASH)],
    # full: skips safe-list approval cards, shell commands run without asking; ALWAYS_DENY still enforced
    "full": ["--permission-mode", "bypassPermissions"],
}

lock = threading.Lock()
procs = {}  # id -> Popen


def sdir(sid):
    return os.path.join(os.environ.get("SESSION_DATA", DATA), sid)


def valid_id(sid):
    return bool(re.fullmatch(r"[0-9a-f-]{36}", sid or ""))


def read_meta(sid):
    with open(os.path.join(sdir(sid), "meta.json")) as f:
        return json.load(f)


def write_meta(sid, meta):
    tmp = os.path.join(sdir(sid), "meta.json.tmp")
    with open(tmp, "w") as f:
        json.dump(meta, f)
    os.replace(tmp, os.path.join(sdir(sid), "meta.json"))


def emit(sid, ev):
    ev = {"ts": time.time(), **ev}
    with open(os.path.join(sdir(sid), "events.jsonl"), "a") as f:
        f.write(json.dumps(ev) + "\n")


def load_providers():
    try:
        with open(PROVIDERS_FILE) as f:
            return [p for p in json.load(f) if p.get("enabled", True)]
    except Exception:
        return []


def read_env_value(path, name):
    try:
        with open(path) as f:
            for line in f:
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip("\"'")
    except Exception:
        pass
    return ""


def nudge_text(status, title, sid):
    base = os.environ.get("SESSION_PUBLIC_URL", "https://sutaeru.com").rstrip("/")
    link = f"{base}/sessions/{sid}"
    t = (title or "").strip()[:60]
    labels = {
        "needs_approval": "Code session needs you",
        "done": "Code session done",
        "error": "Code session error",
        "capped": "Code session capped",
    }
    label = labels.get(status, "Code session update")
    return f"{label}: {t}\n{link}" if t else f"{label}\n{link}"


def send_nudge(sid, status, meta=None):
    try:
        if status not in ("needs_approval", "done", "error", "capped"):
            return
        if meta is None:
            meta = read_meta(sid)
        if meta.get("stop_requested"):
            return
        env_file = os.environ.get("ENV_FILE", "/root/sr1/.env")
        token = read_env_value(env_file, "TELEGRAM_BOT_TOKEN")
        raw_ids = read_env_value(env_file, "TELEGRAM_ALLOWED_USER_IDS")
        if not token or not raw_ids:
            return
        ids = [x.strip() for x in raw_ids.split(",") if x.strip()]
        if not ids:
            return
        text = nudge_text(status, meta.get("title", ""), sid)
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        for chat_id in ids:
            try:
                payload = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
                urllib.request.urlopen(req, timeout=10)
            except Exception:
                pass
    except Exception:
        pass


def sanitize_filename(name, existing=None):
    if not isinstance(name, str):
        name = "file"
    # strip directory paths (both / and \)
    cleaned = re.sub(r"^.*[/\\]", "", name)
    # allow only [A-Za-z0-9._ -]
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", cleaned).strip()
    cleaned = cleaned.lstrip(".")
    if not cleaned:
        cleaned = "file"
    # ensure no path escape
    cleaned = os.path.basename(cleaned)
    if not cleaned or cleaned in (".", ".."):
        cleaned = "file"
    if existing is not None:
        base, ext = os.path.splitext(cleaned)
        candidate = cleaned
        idx = 1
        while candidate in existing:
            candidate = f"{base}_{idx}{ext}"
            idx += 1
        cleaned = candidate
    return cleaned


def save_attachments(sid, attachments):
    if not attachments or not isinstance(attachments, list):
        return []
    uploads_dir = os.path.join(sdir(sid), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    real_uploads = os.path.realpath(uploads_dir)
    existing = set(os.listdir(uploads_dir))
    saved_names = []
    total_bytes = 0
    for att in attachments:
        if not isinstance(att, dict):
            continue
        data_url = att.get("dataUrl", "")
        if not data_url or not isinstance(data_url, str):
            continue
        raw_b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
        try:
            data = base64.b64decode(raw_b64)
        except Exception:
            raise ValueError("Corrupt attachment data.")
        if len(data) > MAX_ATTACH_FILE_BYTES:
            raise ValueError(f"Attachment {att.get('filename', '')} exceeds 10 MB limit.")
        total_bytes += len(data)
        if total_bytes > MAX_ATTACH_TOTAL_BYTES:
            raise ValueError("Attachments exceed 20 MB total limit.")
        safe_name = sanitize_filename(att.get("filename", "upload"), existing)
        existing.add(safe_name)
        target = os.path.join(uploads_dir, safe_name)
        if not os.path.realpath(target).startswith(real_uploads + os.sep):
            raise ValueError("Invalid attachment target path.")
        with open(target, "wb") as f:
            f.write(data)
        saved_names.append(safe_name)
    return saved_names


def provider_env(p, full=False):
    env = {k: v for k, v in os.environ.items() if not k.startswith("ANTHROPIC_")}
    env["HOME"] = "/root"
    secret = ""
    if p.get("key_file"):
        try:
            secret = open(p["key_file"]).read().strip()
        except Exception:
            secret = ""
    elif p.get("key_env_file"):
        secret = read_env_value(p["key_env_file"], p["key_env"])
    if not secret:
        return None
    env["ANTHROPIC_API_KEY"] = secret
    if p.get("base_url"):
        env["ANTHROPIC_BASE_URL"] = p["base_url"]
    if p.get("workspace_id"):
        env["ANTHROPIC_CUSTOM_HEADERS"] = f"anthropic-workspace-id: {p['workspace_id']}"
    env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
    if full:
        env["IS_SANDBOX"] = "1"  # Claude Code refuses bypassPermissions as root without this
    return env


def build_cmd(meta, prompt, p, resume_id):
    cmd = ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose"]
    if meta.get("budget_usd", 0) > 0:
        cmd += ["--max-budget-usd", str(meta["budget_usd"])]
    mode_args = list(MODES[meta["mode"]])
    if "--allowedTools" in mode_args:
        i = mode_args.index("--allowedTools")
        allowed = mode_args[i + 1].split(",")
        del mode_args[i:i + 2]
    else:
        allowed = []
    cmd += mode_args
    # one --allowedTools flag only: a second one would override the first
    all_allowed = allowed + (meta.get("approved_tools") or [])
    if all_allowed:
        cmd += ["--allowedTools", ",".join(all_allowed)]
    cmd += ["--disallowedTools", ",".join(ALWAYS_DENY)]
    if p.get("model"):
        cmd += ["--model", p["model"]]
    for d in meta.get("add_dirs") or []:
        cmd += ["--add-dir", d]
    if resume_id:
        cmd += ["--resume", resume_id]
    cmd += ["--append-system-prompt",
            "You are running from the Sutaeru phone app. Keep replies short and plain. "
            "Never read, print or edit secret files (.env, keys, tokens, SSH). "
            "If an action is denied, say what you wanted to do so the owner can approve it."]
    return cmd


def run_turn(sid, prompt):
    """Run one user turn, falling through the provider chain on limit errors."""
    meta = read_meta(sid)
    if meta.get("mode") == "full":
        elapsed = time.time() - meta.get("created", time.time())
        if elapsed >= FULL_SESSION_TIMEOUT:
            emit(sid, {"type": "sutaeru", "kind": "error", "text": "Session timed out after 30 minutes."})
            finish(sid, "error")
            return
    providers = load_providers()
    if not providers:
        emit(sid, {"type": "sutaeru", "kind": "error", "text": "No providers configured."})
        finish(sid, "error")
        return
    start = meta.get("provider_index", 0) % len(providers)
    order = providers[start:] + providers[:start]
    spent = meta.get("spent_usd", 0.0)
    for attempt, p in enumerate(order):
        if meta.get("budget_usd", 0) > 0 and spent >= meta["budget_usd"]:
            emit(sid, {"type": "sutaeru", "kind": "budget", "text": "Session spend cap reached."})
            finish(sid, "capped")
            return
        env = provider_env(p, meta.get("mode") == "full")
        if env is None:
            emit(sid, {"type": "sutaeru", "kind": "provider_skipped", "provider": p["name"], "text": "key missing"})
            continue
        meta = read_meta(sid)
        meta["provider"] = p["name"]
        meta["status"] = "running"
        write_meta(sid, meta)
        emit(sid, {"type": "sutaeru", "kind": "provider", "provider": p["name"]})
        cmd = build_cmd(meta, prompt, p, meta.get("claude_session_id"))
        proc = None
        for _ in range(10):  # the CLI can be missing for a few seconds while it auto-updates
            try:
                proc = subprocess.Popen(cmd, cwd=meta["cwd"], env=env, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, text=True, bufsize=1,
                                        start_new_session=True)
                break
            except FileNotFoundError:
                time.sleep(3)
        if proc is None:
            emit(sid, {"type": "sutaeru", "kind": "error", "text": "Claude Code is not installed or is updating."})
            finish(sid, "error")
            return
        with lock:
            procs[sid] = proc
        watchdog = None
        timed_out = [False]
        if meta.get("mode") == "full":
            rem = max(0.1, FULL_SESSION_TIMEOUT - (time.time() - meta.get("created", time.time())))
            def on_timeout():
                timed_out[0] = True
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except Exception:
                    pass
            watchdog = threading.Timer(rem, on_timeout)
            watchdog.daemon = True
            watchdog.start()
        failed_for_limit, result = False, None
        tail = []
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except Exception:
                tail.append(line[:300])
                continue
            if ev.get("type") == "system" and ev.get("subtype") in ("task_summary", "post_turn_summary"):
                continue
            if ev.get("type") == "system" and ev.get("subtype") == "init":
                meta = read_meta(sid)
                meta["claude_session_id"] = ev.get("session_id")
                write_meta(sid, meta)
                continue  # the init event lists every tool; not useful on a phone
            if ev.get("type") == "result":
                result = ev
            if (ev.get("type") == "system" and ev.get("subtype") == "api_retry"
                    and ev.get("error_status") in (401, 402, 403, 429, 529) and ev.get("attempt", 0) >= 2):
                failed_for_limit = True
                emit(sid, {"type": "claude", "event": slim(ev)})
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except Exception:
                    pass
                break
            emit(sid, {"type": "claude", "event": slim(ev)})
        proc.wait()
        if watchdog:
            watchdog.cancel()
        if timed_out[0]:
            emit(sid, {"type": "sutaeru", "kind": "error", "text": "Session timed out after 30 minutes."})
            finish(sid, "error")
            return
        if failed_for_limit:
            result = None
        with lock:
            procs.pop(sid, None)
        meta = read_meta(sid)
        if meta.get("stop_requested"):
            finish(sid, "stopped")
            return
        if result:
            spent += float(result.get("total_cost_usd") or 0) if p.get("kind") == "anthropic" else 0.0
            meta["spent_usd"] = spent
            write_meta(sid, meta)
            text = " ".join(str(result.get(k, "")) for k in ("result", "subtype", "terminal_reason"))
            if result.get("is_error") and LIMIT_RE.search(text):
                failed_for_limit = True
            elif result.get("is_error"):
                emit(sid, {"type": "sutaeru", "kind": "error", "text": str(result.get("result"))[:300]})
                finish(sid, "error")
                return
            else:
                denials = result.get("permission_denials") or []
                if denials:
                    meta = read_meta(sid)
                    meta["pending_approvals"] = [
                        {"id": d.get("tool_use_id"), "tool": d.get("tool_name"), "input": d.get("tool_input")}
                        for d in denials
                    ]
                    write_meta(sid, meta)
                finish(sid, "needs_approval" if denials else "done")
                return
        else:
            failed_for_limit = failed_for_limit or bool(LIMIT_RE.search(" ".join(tail)))
            if not failed_for_limit:
                emit(sid, {"type": "sutaeru", "kind": "error", "text": " | ".join(tail)[-300:] or "Claude exited without a result"})
                finish(sid, "error")
                return
        if failed_for_limit:
            nxt = order[attempt + 1]["name"] if attempt + 1 < len(order) else None
            emit(sid, {"type": "sutaeru", "kind": "provider_limit", "provider": p["name"], "next": nxt,
                       "text": f"{p['name']} hit a limit" + (f", switching to {nxt}" if nxt else "")})
            meta = read_meta(sid)
            meta["provider_index"] = (start + attempt + 1) % len(providers)
            write_meta(sid, meta)
            prompt = "Continue exactly where you left off."
    emit(sid, {"type": "sutaeru", "kind": "error", "text": "Every provider is out of limits."})
    finish(sid, "error")


def slim(ev):
    """Keep events small: cap huge tool outputs."""
    s = json.dumps(ev)
    if len(s) < 20000:
        return ev
    return {"type": ev.get("type"), "truncated": True, "preview": s[:4000]}


def finish(sid, status):
    meta = read_meta(sid)
    was_stopped = meta.get("stop_requested", False)
    meta["status"] = status
    meta["stop_requested"] = False
    meta["updated"] = time.time()
    should_nudge = (not was_stopped and status != "stopped" and
                    status in ("needs_approval", "done", "error", "capped") and
                    meta.get("last_nudged_status") != status)
    if should_nudge:
        meta["last_nudged_status"] = status
    write_meta(sid, meta)
    emit(sid, {"type": "sutaeru", "kind": "status", "status": status})
    if should_nudge:
        send_nudge(sid, status, meta)


def safe_turn(sid, prompt):
    try:
        run_turn(sid, prompt)
    except Exception as e:
        try:
            emit(sid, {"type": "sutaeru", "kind": "error", "text": f"Internal error: {type(e).__name__}"})
            finish(sid, "error")
        except Exception:
            pass


def start_turn(sid, prompt):
    threading.Thread(target=safe_turn, args=(sid, prompt), daemon=True).start()


def create(body):
    cwd = body.get("cwd") or DEFAULT_CWD
    if not os.path.isdir(cwd) or not os.path.realpath(cwd).startswith("/root/"):
        raise ValueError("cwd must be a directory under /root")
    mode = body.get("mode", "read")
    if mode not in MODES:
        raise ValueError("mode must be read, edit, or full")
    if sum(1 for p in procs.values() if p.poll() is None) >= MAX_RUNNING:
        raise RuntimeError("too many running sessions")
    sid = str(uuid.uuid4())
    os.makedirs(sdir(sid))
    prompt = str(body.get("prompt", "")).strip()
    attachments = body.get("attachments") or []
    if not prompt and not attachments:
        raise ValueError("prompt required")
    if not prompt and attachments:
        prompt = "Inspect the attached files."
    saved_files = save_attachments(sid, attachments) if attachments else []
    add_dirs = []
    turn_prompt = prompt
    if saved_files:
        uploads_dir = os.path.join(sdir(sid), "uploads")
        add_dirs.append(uploads_dir)
        note = f"Files the owner attached are in {uploads_dir}: {', '.join(saved_files)}."
        turn_prompt = f"{prompt}\n\n{note}"
    default_budget = DEFAULT_BUDGET
    meta = {"id": sid, "title": prompt[:60], "cwd": cwd, "mode": mode, "status": "running",
            "created": time.time(), "updated": time.time(), "spent_usd": 0.0,
            "budget_usd": max(0.0, min(float(body.get("budget_usd") or default_budget), 25.0)),
            "approved_tools": [], "pending_approvals": [], "add_dirs": add_dirs,
            "last_nudged_status": None}
    write_meta(sid, meta)
    emit(sid, {"type": "sutaeru", "kind": "user", "text": prompt})
    start_turn(sid, turn_prompt)
    return meta


def list_sessions():
    out = []
    for sid in os.listdir(DATA):
        if valid_id(sid):
            try:
                out.append(read_meta(sid))
            except Exception:
                pass
    return sorted(out, key=lambda m: -m.get("updated", 0))


def read_events(sid, after):
    path = os.path.join(sdir(sid), "events.jsonl")
    events = []
    if os.path.exists(path):
        with open(path) as f:
            for i, line in enumerate(f):
                if i >= after:
                    events.append({"n": i, **json.loads(line)})
    return events


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def authed(self):
        got = self.headers.get("Authorization", "")
        return hmac.compare_digest(got, f"Bearer {TOKEN}")

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n < 35 * 1024 * 1024 else {}

    def route(self, method):
        if not self.authed():
            return self.send(401, {"error": "unauthorized"})
        u = urlparse(self.path)
        parts = [x for x in u.path.split("/") if x]
        q = parse_qs(u.query)
        try:
            if parts == ["health"]:
                return self.send(200, {"ok": True, "providers": [p["name"] for p in load_providers()]})
            if parts == ["sessions"] and method == "GET":
                return self.send(200, {"sessions": list_sessions()})
            if parts == ["sessions"] and method == "POST":
                return self.send(200, create(self.body()))
            if len(parts) >= 2 and parts[0] == "sessions" and valid_id(parts[1]):
                sid = parts[1]
                if not os.path.isdir(sdir(sid)):
                    return self.send(404, {"error": "not found"})
                if len(parts) == 2 and method == "GET":
                    after = int(q.get("after", ["0"])[0])
                    return self.send(200, {"session": read_meta(sid), "events": read_events(sid, after)})
                if parts[2:] == ["message"] and method == "POST":
                    meta = read_meta(sid)
                    if meta["status"] == "running":
                        return self.send(409, {"error": "session is busy"})
                    if meta.get("mode") == "full" and time.time() - meta.get("created", 0) >= FULL_SESSION_TIMEOUT:
                        return self.send(400, {"error": "Session timed out after 30 minutes."})
                    b = self.body()
                    text = str(b.get("text", "")).strip()
                    attachments = b.get("attachments") or []
                    if not text and not attachments:
                        return self.send(400, {"error": "text required"})
                    if not text and attachments:
                        text = "Inspect the attached files."
                    saved_files = save_attachments(sid, attachments) if attachments else []
                    turn_prompt = text
                    if saved_files:
                        uploads_dir = os.path.join(sdir(sid), "uploads")
                        if uploads_dir not in meta.setdefault("add_dirs", []):
                            meta["add_dirs"].append(uploads_dir)
                        note = f"Files the owner attached are in {uploads_dir}: {', '.join(saved_files)}."
                        turn_prompt = f"{text}\n\n{note}"
                    meta["status"], meta["pending_approvals"], meta["updated"] = "running", [], time.time()
                    meta["last_nudged_status"] = None
                    write_meta(sid, meta)
                    emit(sid, {"type": "sutaeru", "kind": "user", "text": text})
                    start_turn(sid, turn_prompt)
                    return self.send(200, {"ok": True})
                if parts[2:] == ["approve"] and method == "POST":
                    meta = read_meta(sid)
                    if meta["status"] != "needs_approval":
                        return self.send(409, {"error": "nothing to approve"})
                    b = self.body()
                    if b.get("deny"):
                        meta["pending_approvals"], meta["status"] = [], "done"
                        write_meta(sid, meta)
                        emit(sid, {"type": "sutaeru", "kind": "denied", "text": "You declined."})
                        return self.send(200, {"ok": True})
                    tools = []
                    for a in meta["pending_approvals"]:
                        t = a["tool"]
                        inp = a.get("input") or {}
                        # allow exactly the approved command / file, not the whole tool
                        spec = inp.get("command") or inp.get("file_path")
                        if spec and t in ("Edit", "Write") and spec.startswith("/"):
                            spec = "/" + spec  # absolute paths need a // prefix in permission rules
                        tools.append(f"{t}({spec})" if spec and t in ("Bash", "Edit", "Write") else t)
                    for a in meta["pending_approvals"]:
                        fp = (a.get("input") or {}).get("file_path")
                        if fp and a["tool"] in ("Edit", "Write") and not os.path.realpath(fp).startswith(os.path.realpath(meta["cwd"]) + "/"):
                            d = os.path.dirname(os.path.realpath(fp))
                            if d.startswith("/root/") and d not in meta.setdefault("add_dirs", []):
                                meta["add_dirs"].append(d)
                    meta["approved_tools"] = sorted(set(meta["approved_tools"] + tools))
                    meta["pending_approvals"], meta["status"] = [], "running"
                    meta["last_nudged_status"] = None
                    write_meta(sid, meta)
                    emit(sid, {"type": "sutaeru", "kind": "approved", "text": "Approved: " + ", ".join(tools)})
                    start_turn(sid, "The owner approved the previous action. Go ahead and do it.")
                    return self.send(200, {"ok": True})
                if parts[2:] == ["stop"] and method == "POST":
                    meta = read_meta(sid)
                    meta["stop_requested"] = True
                    write_meta(sid, meta)
                    with lock:
                        p = procs.get(sid)
                    if p and p.poll() is None:
                        os.killpg(os.getpgid(p.pid), signal.SIGTERM)
                    return self.send(200, {"ok": True})
            return self.send(404, {"error": "not found"})
        except (ValueError, RuntimeError) as e:
            return self.send(400, {"error": str(e)})
        except Exception as e:
            return self.send(500, {"error": type(e).__name__})

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")


def recover():
    """After a restart, sessions that were running are marked interrupted."""
    for m in list_sessions():
        if m.get("status") == "running":
            finish(m["id"], "interrupted")


if __name__ == "__main__":
    os.makedirs(DATA, exist_ok=True)
    recover()
    ThreadingHTTPServer((BIND, PORT), H).serve_forever()
