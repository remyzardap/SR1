#!/usr/bin/env bash
# Batch image generation on a Jarvis Labs GPU. The instance is destroyed on exit, even on failure.
#   scripts/gpu-image/run.sh prompts.jsonl [out-dir]
# Env: JL_API_KEY (or `jl setup`), JL_GPU (default L4), JL_STORAGE (GB, default 60),
#      IMG_MODEL (default FLUX.1-schnell), IMG_STEPS (default 4), HF_TOKEN (only for gated models)
set -euo pipefail
PROMPTS=${1:?usage: run.sh prompts.jsonl [out-dir]}
OUT=${2:-gpu-image-out}
HERE=$(cd "$(dirname "$0")" && pwd)
[ -f "$PROMPTS" ] || { echo "no such file: $PROMPTS" >&2; exit 1; }
[ -z "${JL_API_KEY:-}" ] && [ -f "$HERE/../../.env" ] && JL_API_KEY=$(grep -E '^JL_API_KEY=' "$HERE/../../.env" | cut -d= -f2- | tr -d '"' ) && export JL_API_KEY

ID=
cleanup() { [ -n "$ID" ] && { echo "destroying instance $ID"; jl destroy "$ID" --yes >/dev/null 2>&1 || echo "WARNING: destroy failed, check 'jl list' and destroy $ID by hand" >&2; }; }
trap cleanup EXIT

echo "creating ${JL_GPU:-L4} instance"
ID=$(jl create --gpu "${JL_GPU:-L4}" --storage "${JL_STORAGE:-60}" --name sutaeru-img --yes --json |
  python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("machine_id") or d.get("id") or d["instance"]["machine_id"])')
echo "instance $ID"

jl upload "$ID" "$HERE/gen.py" /home/gen.py
jl upload "$ID" "$PROMPTS" /home/prompts.jsonl
jl exec "$ID" -- "pip install -q diffusers transformers accelerate sentencepiece protobuf"
jl exec "$ID" -- "cd /home && HF_TOKEN=${HF_TOKEN:-} python gen.py --prompts prompts.jsonl --out out --model ${IMG_MODEL:-black-forest-labs/FLUX.1-schnell} --steps ${IMG_STEPS:-4}"
mkdir -p "$OUT"
jl download "$ID" /home/out "$OUT" -r
echo "images in $OUT"
