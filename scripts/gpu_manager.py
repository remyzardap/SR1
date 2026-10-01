#!/usr/bin/env python3
"""On-demand GPU for Stable Diffusion Forge on Jarvislabs.

Sutaeru posts a txt2img body to this service. It resumes the paused instance if
needed, waits for Forge, forwards the request, and pauses the instance again
once nothing has been running for IDLE_SECONDS. The Jarvislabs key and the Forge
login live only here; callers hold one shared token.

  POST /v1/txt2img   forwards the JSON body to Forge /sdapi/v1/txt2img
  GET  /v1/status    {state, inflight, idleFor}

Config (env, all optional except the secret files):
  JL_KEY_FILE=/root/.jarvis_key  FORGE_PW_FILE=/root/.forge_pw  TOKEN_FILE=/root/.gpu_manager_token
  FORGE_INSTANCE_NAME=sd-forge  FORGE_USER=remy  FORGE_SCRIPT_ID=7623
  IDLE_SECONDS=120  BIND=172.18.0.1  PORT=8788  WARM_TIMEOUT=240  GEN_TIMEOUT=300
"""
import base64, json, logging, os, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from jarvislabs import Client

def _read(path): return open(path).read().strip()

KEY = _read(os.environ.get("JL_KEY_FILE", "/root/.jarvis_key"))
FORGE_PW = _read(os.environ.get("FORGE_PW_FILE", "/root/.forge_pw"))
TOKEN = _read(os.environ.get("TOKEN_FILE", "/root/.gpu_manager_token"))
NAME = os.environ.get("FORGE_INSTANCE_NAME", "sd-forge")
USER = os.environ.get("FORGE_USER", "remy")
SCRIPT_ID = int(os.environ.get("FORGE_SCRIPT_ID", "7623"))
IDLE = int(os.environ.get("IDLE_SECONDS", "120"))
BIND = os.environ.get("BIND", "172.18.0.1")
PORT = int(os.environ.get("PORT", "8788"))
WARM_TIMEOUT = int(os.environ.get("WARM_TIMEOUT", "240"))
GEN_TIMEOUT = int(os.environ.get("GEN_TIMEOUT", "300"))
AUTH = "Basic " + base64.b64encode(f"{USER}:{FORGE_PW}".encode()).decode()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("gpu")

jl = Client(KEY)
lock = threading.Lock()          # one lifecycle action at a time
state_lock = threading.Lock()
inflight = 0
last_activity = time.time()
forge_base = None                # known-good Forge base URL while running


def find():
    for i in jl.instances.list():
        if i.name == NAME:
            return i
    return None


def healthy(base):
    req = urllib.request.Request(base + "/sdapi/v1/sd-models", headers={"Authorization": AUTH, "User-Agent": "curl/8.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status == 200
    except Exception:
        return False


def pick_base(inst):
    for base in inst.endpoints or []:
        if healthy(base):
            return base
    return None


def ensure_up():
    """Return a healthy Forge base URL, resuming the instance if it is paused."""
    global forge_base
    with lock:
        if forge_base and healthy(forge_base):
            return forge_base
        forge_base = None
        inst = find()
        if inst is None:
            raise RuntimeError(f"instance {NAME} not found")
        if inst.status == "Paused":
            log.info("resuming %s (%s)", NAME, inst.machine_id)
            jl.instances.resume(inst.machine_id, http_ports="7860", script_id=SCRIPT_ID)
        deadline = time.time() + WARM_TIMEOUT
        while time.time() < deadline:
            inst = find()
            if inst and inst.status == "Running":
                base = pick_base(inst)
                if base:
                    forge_base = base
                    log.info("forge ready at %s", base)
                    return base
            time.sleep(5)
        raise RuntimeError("GPU did not warm up in time")


def pause_if_idle():
    global forge_base
    with state_lock:
        busy = inflight > 0 or (time.time() - last_activity) < IDLE
    if busy:
        return
    with lock:
        with state_lock:  # re-check: a request may have arrived while waiting for the lock
            if inflight > 0 or (time.time() - last_activity) < IDLE:
                return
        inst = find()
        if inst and inst.status == "Running":
            log.info("idle for %ss, pausing %s", IDLE, inst.machine_id)
            try:
                jl.instances.pause(inst.machine_id)
                forge_base = None
            except Exception as e:
                log.error("pause failed: %s", e)


def watchdog():
    while True:
        time.sleep(10)
        try:
            pause_if_idle()
        except Exception as e:
            log.error("watchdog: %s", e)


def touch():
    global last_activity
    with state_lock:
        last_activity = time.time()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _authed(self):
        if self.headers.get("X-Manager-Token") == TOKEN:
            return True
        self._send(401, {"error": "unauthorized"})
        return False

    def do_GET(self):
        if not self._authed():
            return
        if self.path == "/v1/status":
            with state_lock:
                return self._send(200, {"state": "up" if forge_base else "down", "inflight": inflight,
                                        "idleFor": int(time.time() - last_activity), "idleLimit": IDLE})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        global inflight
        if not self._authed():
            return
        if self.path != "/v1/txt2img":
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > 1_000_000:
            return self._send(400, {"error": "bad body"})
        body = self.rfile.read(n)
        with state_lock:
            inflight += 1
        try:
            try:
                base = ensure_up()
            except Exception as e:
                log.error("warmup failed: %s", e)
                return self._send(503, {"error": "gpu_unavailable"})
            req = urllib.request.Request(base + "/sdapi/v1/txt2img", data=body, method="POST",
                                         headers={"Content-Type": "application/json", "Authorization": AUTH,
                                                  "User-Agent": "curl/8.0"})
            try:
                with urllib.request.urlopen(req, timeout=GEN_TIMEOUT) as r:
                    data = r.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except urllib.error.HTTPError as e:
                log.error("forge http %s", e.code)
                self._send(502, {"error": "forge_error", "status": e.code})
            except Exception as e:
                log.error("forge call failed: %s", type(e).__name__)
                self._send(504, {"error": "forge_timeout"})
        finally:
            with state_lock:
                inflight -= 1
            touch()


if __name__ == "__main__":
    touch()  # an instance already running at start gets the normal idle window, then pauses
    threading.Thread(target=watchdog, daemon=True).start()
    log.info("gpu manager on %s:%s, idle %ss", BIND, PORT, IDLE)
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
