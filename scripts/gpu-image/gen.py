"""Runs on the Jarvis Labs GPU: renders every prompt in a JSONL file with diffusers.

Input line:  {"id": "hero-1", "prompt": "...", "aspect": "16:9"}   (aspect optional, default 1:1)
Output:      <out>/<id>.png  and  <out>/manifest.jsonl
"""
import argparse, json, os, time

SIZES = {"1:1": (1024, 1024), "16:9": (1344, 768), "9:16": (768, 1344), "4:3": (1152, 896), "3:4": (896, 1152)}

ap = argparse.ArgumentParser()
ap.add_argument("--prompts", required=True)
ap.add_argument("--out", default="out")
ap.add_argument("--model", default="black-forest-labs/FLUX.1-schnell")
ap.add_argument("--steps", type=int, default=4)
args = ap.parse_args()

import torch
from diffusers import DiffusionPipeline

os.makedirs(args.out, exist_ok=True)
pipe = DiffusionPipeline.from_pretrained(args.model, torch_dtype=torch.bfloat16).to("cuda")

with open(args.prompts) as f, open(os.path.join(args.out, "manifest.jsonl"), "w") as manifest:
    for line in f:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        w, h = SIZES.get(job.get("aspect", "1:1"), SIZES["1:1"])
        t0 = time.time()
        image = pipe(job["prompt"], width=w, height=h, num_inference_steps=args.steps, guidance_scale=0.0).images[0]
        path = os.path.join(args.out, f"{job['id']}.png")
        image.save(path)
        manifest.write(json.dumps({"id": job["id"], "file": os.path.basename(path), "w": w, "h": h, "model": args.model, "seconds": round(time.time() - t0, 1)}) + "\n")
        manifest.flush()
        print(f"done {job['id']} {time.time() - t0:.1f}s", flush=True)
