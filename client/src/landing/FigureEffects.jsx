import { useRef, useEffect } from 'react';

export function OrbitalSystem({ visible, mouseX = 0.5, mouseY = 0.5 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    mouseRef.current = { x: mouseX, y: mouseY };
  }, [mouseX, mouseY]);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W, H;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const speedMul = reduced ? 0.15 : 1;
    const rings = [
      { count: 36, rx: 0.27, ry: 0.096, speed: 0.007, color: [203, 197, 186], size: 3.2, glow: 18, lineAlpha: 0.07 },
      { count: 55, rx: 0.51, ry: 0.174, speed: -0.0045, color: [180, 175, 166], size: 2.6, glow: 14, lineAlpha: 0.04 },
      { count: 80, rx: 0.81, ry: 0.264, speed: 0.0028, color: [221, 216, 208], size: 2.0, glow: 11, lineAlpha: 0.025 },
    ];

    const particles = rings.map(ring =>
      Array.from({ length: ring.count }, (_, i) => ({
        angle: (i / ring.count) * Math.PI * 2 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.003,
      }))
    );

    let t = 0;
    let smoothMX = 0.5, smoothMY = 0.5;

    const draw = () => {
      smoothMX += (mouseRef.current.x - smoothMX) * 0.06;
      smoothMY += (mouseRef.current.y - smoothMY) * 0.06;

      ctx.clearRect(0, 0, W, H);
      t += 0.016;

      const tiltX = (smoothMX - 0.5) * 40;
      const tiltY = (smoothMY - 0.5) * 20;
      const cx = W / 2 + tiltX;
      const cy = H * 0.50 + tiltY;

      const corePulse = 0.5 + Math.sin(t * 1.8) * 0.5;
      for (let r = 160; r > 0; r -= 6) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(203, 197, 186, ${0.004 * corePulse * (1 - r / 160)})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 6 + corePulse * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(203, 197, 186, ${0.4 + corePulse * 0.6})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + corePulse * 0.5})`;
      ctx.fill();

      rings.forEach((ring, ri) => {
        const ps = particles[ri];
        const rx = W * ring.rx;
        const ry = W * ring.ry;
        const [cr, cg, cb] = ring.color;

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.03)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ps.forEach(p => { p.angle += (ring.speed + p.drift * Math.sin(t * 0.5)) * speedMul; });

        for (let i = 0; i < ps.length; i++) {
          const p1 = ps[i];
          const p2 = ps[(i + 1) % ps.length];
          const x1 = cx + Math.cos(p1.angle) * rx;
          const y1 = cy + Math.sin(p1.angle) * ry;
          const x2 = cx + Math.cos(p2.angle) * rx;
          const y2 = cy + Math.sin(p2.angle) * ry;
          const d1 = (Math.sin(p1.angle) + 1) / 2;
          const d2 = (Math.sin(p2.angle) + 1) / 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${ring.lineAlpha * (d1 + d2) * 0.5})`;
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }

        const sorted = ps.map((p, i) => ({ ...p, idx: i }))
          .sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle));

        sorted.forEach(p => {
          const x = cx + Math.cos(p.angle) * rx;
          const y = cy + Math.sin(p.angle) * ry;
          const depth = (Math.sin(p.angle) + 1) / 2;
          const pulse = (Math.sin(t * 2.5 + p.phase) + 1) / 2;
          const sz = ring.size * (0.35 + depth * 0.65) * (0.85 + pulse * 0.15);
          const op = (0.15 + depth * 0.85) * (0.5 + pulse * 0.5);

          const glowR = ring.glow * (0.3 + depth * 0.7);
          const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
          grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${op * 0.25})`);
          grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);

          ctx.beginPath();
          ctx.arc(x, y, sz, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${op})`;
          ctx.fill();

          if (depth > 0.8 && pulse > 0.7) {
            ctx.beginPath();
            ctx.arc(x, y, sz * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${(depth - 0.8) * 5 * pulse * 0.4})`;
            ctx.fill();
          }
        });
      });

      const ep = (Math.sin(t * 0.8) + 1) / 2;
      for (let i = 0; i < 12; i++) {
        const angle = t * 0.3 + (i * Math.PI * 2) / 12;
        const dist = W * 0.08 + ep * W * 0.02;
        const ex = cx + Math.cos(angle) * dist;
        const ey = cy + Math.sin(angle) * dist * 0.35;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(203, 197, 186, ${0.2 + ep * 0.3})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [visible]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 4,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.5s ease',
      }}
    />
  );
}

export function AuroraRibbon({ visible, mouseX = 0.5 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const mouseRef = useRef(0.5);

  useEffect(() => { mouseRef.current = mouseX; }, [mouseX]);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W, H;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.008;

      const mxOff = (mouseRef.current - 0.5) * 30;
      const baseY = H * 0.50 + mxOff * 0.3;
      const ribbonH = 2.5;

      for (let pass = 0; pass < 3; pass++) {
        const yOff = (pass - 1) * 8;
        const alpha = pass === 1 ? 0.5 : 0.15;
        const blur = pass === 1 ? 0 : 12;

        ctx.save();
        if (blur > 0) ctx.filter = `blur(${blur}px)`;

        ctx.beginPath();
        ctx.moveTo(-20, baseY + yOff);

        for (let x = 0; x <= W + 20; x += 4) {
          const nx = x / W;
          const wave = Math.sin(nx * Math.PI * 3 + t) * 20
            + Math.sin(nx * Math.PI * 5 - t * 1.3) * 8
            + Math.sin(nx * Math.PI * 7 + t * 0.7) * 4;
          ctx.lineTo(x, baseY + yOff + wave);
        }

        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, `rgba(203, 197, 186, 0)`);
        grad.addColorStop(0.15, `rgba(203, 197, 186, ${alpha * 0.6})`);
        grad.addColorStop(0.35, `rgba(180, 175, 166, ${alpha})`);
        grad.addColorStop(0.5, `rgba(221, 216, 208, ${alpha * 1.2})`);
        grad.addColorStop(0.65, `rgba(180, 175, 166, ${alpha})`);
        grad.addColorStop(0.85, `rgba(221, 216, 208, ${alpha * 0.4})`);
        grad.addColorStop(1, `rgba(221, 216, 208, 0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = ribbonH + (pass === 1 ? 1 : 4);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      }

      const scanX = ((t * 60) % (W + 200)) - 100;
      const scanGrad = ctx.createRadialGradient(scanX, baseY, 0, scanX, baseY, 40);
      scanGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      scanGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(scanX - 40, baseY - 40, 80, 80);

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [visible]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 3,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease',
      }}
    />
  );
}
