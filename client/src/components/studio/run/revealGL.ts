/* The image run's reveal, drawn with one WebGL fragment shader.

   A picture is held as two textures: a sharp one and a tiny blurred one. `clarity` walks the frame
   from paper and fine grain (0), through soft colour masses with a halftone screen (about 0.5),
   to the sharp picture (1). Two picture slots crossfade with `swap`, so the preview of the shot
   can hand over to the real picture without a jump. No dependencies; returns null without WebGL. */

export interface RevealFrame {
  /** 0 paper and grain, 1 the sharp picture. */
  clarity: number;
  /** 0 the first picture, 1 the second. */
  swap: number;
  /** Canvas opacity. */
  cover: number;
  /** Scan light position (0 top-left to 1 bottom-right), below -0.5 when off. */
  scan: number;
  /** -1..1 pointer tilt. */
  tiltX: number;
  tiltY: number;
  /** Seconds, for the grain. */
  time: number;
  /** 0..1 grey veil for a stopped run. */
  dim: number;
}

type RGB = [number, number, number];

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uAs;
uniform sampler2D uB;
uniform sampler2D uBs;
uniform float uSwap;
uniform float uClar;
uniform float uCover;
uniform float uTime;
uniform float uScan;
uniform float uDim;
uniform float uGrain;
uniform float uDot;
uniform vec2 uTilt;
uniform vec2 uSoftPx;
uniform vec3 uPaper;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 softAt(sampler2D t, vec2 uv) {
  vec3 c = texture2D(t, uv).rgb * 0.36;
  c += texture2D(t, uv + vec2(uSoftPx.x, 0.0)).rgb * 0.16;
  c += texture2D(t, uv - vec2(uSoftPx.x, 0.0)).rgb * 0.16;
  c += texture2D(t, uv + vec2(0.0, uSoftPx.y)).rgb * 0.16;
  c += texture2D(t, uv - vec2(0.0, uSoftPx.y)).rgb * 0.16;
  return c;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float unres = 1.0 - uClar;

  /* Parallax: the unresolved masses drift further than the detail, inside a 3% overscan. */
  vec2 par = uTilt * 0.014 * (0.35 + unres);
  vec2 uvS = (uv - 0.5) * 0.97 + 0.5 + par;
  vec2 uvH = (uv - 0.5) * 0.97 + 0.5 + par * 0.4;

  /* Scan light: a soft diagonal band that resolves the picture a little as it passes. */
  float d = (uv.y + (uv.x - 0.5) * 0.4) - uScan;
  float band = uScan < -0.5 ? 0.0 : exp(-d * d / 0.0065);
  float clar = clamp(uClar + band * 0.09 * unres, 0.0, 1.0);

  vec3 soft = mix(softAt(uAs, uvS), softAt(uBs, uvS), uSwap);
  vec3 sharp = mix(texture2D(uA, uvH).rgb, texture2D(uB, uvH).rgb, uSwap);

  float mass = smoothstep(0.03, 0.5, clar);
  float detail = smoothstep(0.62, 1.0, clar);
  vec3 col = mix(uPaper, soft, mass);

  /* Halftone screen at 45 degrees, strongest while the masses form. */
  float ht = smoothstep(0.1, 0.36, clar) * (1.0 - smoothstep(0.58, 0.9, clar));
  if (ht > 0.002) {
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / uDot);
    vec2 f = fract(q) - 0.5;
    float lum = dot(soft, vec3(0.299, 0.587, 0.114));
    float r = sqrt(clamp(1.04 - lum, 0.0, 1.0)) * 0.6;
    float aa = 1.4 / uDot;
    float dotMask = 1.0 - smoothstep(r - aa, r + aa, length(f));
    vec3 inked = mix(mix(uPaper, soft, 0.5), soft * 0.7, dotMask);
    col = mix(col, inked, ht * 0.62);
  }

  col = mix(col, sharp, detail);

  /* Film grain at 12 steps a second: fine everywhere, a coarser drift while nothing has formed. */
  float gt = floor(uTime * 12.0);
  float n = hash(floor(gl_FragCoord.xy / uGrain) + gt * vec2(37.0, 17.0));
  float n2 = hash(floor(gl_FragCoord.xy / (uGrain * 3.0)) + gt * vec2(11.0, 53.0));
  float gAmt = 0.26 * pow(unres, 1.3);
  col += (n - 0.5) * gAmt + (n2 - 0.5) * gAmt * 0.6 * (1.0 - mass);

  col += band * vec3(1.0, 0.93, 0.85) * 0.075 * (1.0 - detail);

  float g = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, mix(vec3(g), uPaper, 0.3), uDim);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col * uCover, uCover);
}`;

/** The texture size for the sharp picture, and the blurred one. */
const SHARP_MAX = 768;
const SOFT_W = 36;

export interface CropHint {
  /** Focus point, 0..100 percent of the source. */
  focus?: [number, number];
  /** Zoom into the cover crop around the focus. */
  zoom?: number;
}

/** A cover crop of the source to `aspect`, zoomed around a focus point. */
export function coverCrop(sw: number, sh: number, aspect: number, hint: CropHint = {}) {
  let cw = sw;
  let ch = sw / aspect;
  if (ch > sh) {
    ch = sh;
    cw = sh * aspect;
  }
  const z = Math.max(1, hint.zoom ?? 1);
  cw /= z;
  ch /= z;
  const [fx, fy] = hint.focus ?? [50, 50];
  const x = Math.min(sw - cw, Math.max(0, (fx / 100) * sw - cw / 2));
  const y = Math.min(sh - ch, Math.max(0, (fy / 100) * sh - ch / 2));
  return { x, y, w: cw, h: ch };
}

export function cssColor(name: string, fallback: RGB): RGB {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class RevealGL {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private tex: WebGLTexture[] = [];
  private paper: RGB = [0.97, 0.96, 0.95];
  private dpr = 1;
  private slotB = false;

  static create(canvas: HTMLCanvasElement): RevealGL | null {
    try {
      const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
      if (!gl) return null;
      return new RevealGL(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["uA", "uAs", "uB", "uBs", "uSwap", "uClar", "uCover", "uTime", "uScan", "uDim", "uGrain", "uDot", "uTilt", "uSoftPx", "uPaper"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    for (let i = 0; i < 4; i++) {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
      this.tex.push(t);
    }
    gl.uniform1i(this.u.uA, 0);
    gl.uniform1i(this.u.uAs, 1);
    gl.uniform1i(this.u.uB, 2);
    gl.uniform1i(this.u.uBs, 3);
  }

  setPaper(rgb: RGB) {
    this.paper = rgb;
  }

  /** Load a picture into slot A (first) or B (the one `swap` fades to). */
  setPicture(slot: "a" | "b", img: CanvasImageSource & { width: number; height: number }, aspect: number, hint?: CropHint) {
    const gl = this.gl;
    const iw = (img as HTMLImageElement).naturalWidth || img.width;
    const ih = (img as HTMLImageElement).naturalHeight || img.height;
    if (!iw || !ih) return;
    const c = coverCrop(iw, ih, aspect, hint);
    const sw = Math.round(Math.min(SHARP_MAX, c.w) * (aspect >= 1 ? 1 : aspect));
    const sharp = document.createElement("canvas");
    sharp.width = Math.max(2, sw);
    sharp.height = Math.max(2, Math.round(sharp.width / aspect));
    sharp.getContext("2d")!.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, sharp.width, sharp.height);
    const soft = document.createElement("canvas");
    soft.width = SOFT_W;
    soft.height = Math.max(2, Math.round(SOFT_W / aspect));
    const sx = soft.getContext("2d")!;
    sx.imageSmoothingQuality = "high";
    sx.drawImage(sharp, 0, 0, soft.width, soft.height);
    const base = slot === "a" ? 0 : 2;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.activeTexture(gl.TEXTURE0 + base);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[base]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sharp);
    gl.activeTexture(gl.TEXTURE0 + base + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[base + 1]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, soft);
    gl.uniform2f(this.u.uSoftPx, 0.9 / soft.width, 0.9 / soft.height);
    if (slot === "b") this.slotB = true;
  }

  get hasB() {
    return this.slotB;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    this.dpr = Math.min(2, Math.max(1, dpr));
    const w = Math.max(1, Math.round(cssW * this.dpr));
    const h = Math.max(1, Math.round(cssH * this.dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  draw(f: RevealFrame) {
    const gl = this.gl;
    const u = this.u;
    gl.uniform1f(u.uClar, f.clarity);
    gl.uniform1f(u.uSwap, f.swap);
    gl.uniform1f(u.uCover, f.cover);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform1f(u.uScan, f.scan);
    gl.uniform1f(u.uDim, f.dim);
    gl.uniform2f(u.uTilt, f.tiltX, f.tiltY);
    gl.uniform1f(u.uGrain, 1.15 * this.dpr);
    gl.uniform1f(u.uDot, 5.5 * this.dpr);
    gl.uniform3f(u.uPaper, this.paper[0], this.paper[1], this.paper[2]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    const gl = this.gl;
    this.tex.forEach((t) => gl.deleteTexture(t));
    gl.deleteProgram(this.prog);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
