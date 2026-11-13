// NeuronMapFiring: the one neuron map firing visualization. Books imports
// this same component; there is no duplicate map code. Read-only over the
// bank state (phases, amplitudes, fatigue) so the tick loop owns all updates.
import React, { useEffect, useRef } from 'react';
import { DOMAINS } from '../../jev/oscillator-bank.mjs';

export function NeuronMapFiring({ harness, decision, height = 260, className = '' }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ harness, decision });
  stateRef.current = { harness, decision };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let flash = 0;
    let lastId = null;

    const draw = () => {
      const { harness: h, decision: d } = stateRef.current;
      const rect = canvas.parentElement?.getBoundingClientRect();
      const w = Math.max(120, rect?.width ?? canvas.width);
      const cssH = height;
      const dpr = globalThis.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== cssH * dpr) {
        canvas.width = w * dpr; canvas.height = cssH * dpr;
        canvas.style.width = `${w}px`; canvas.style.height = `${cssH}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, cssH);

      if (d && d.templateId !== lastId) { lastId = d.templateId; flash = 1; }
      flash *= 0.94;

      if (!h) {
        ctx.fillStyle = 'rgba(128,128,128,0.5)';
        ctx.font = '11px system-ui';
        ctx.fillText('No lattice active — build a book lattice to fire the map.', 12, cssH / 2);
        raf = requestAnimationFrame(draw);
        return;
      }

      const bank = h.bank;
      // sample the bank: one node per ring position, grouped by domain
      const sample = 240;
      const total = bank.count;
      const stride = Math.max(1, Math.floor(total / sample));
      const cx = w / 2, cy = cssH / 2, R = Math.min(w, cssH) / 2 - 18;
      // ring label: 12 domains around the circle
      for (let k = 0; k < DOMAINS.length; k++) {
        const a = (k / DOMAINS.length) * Math.PI * 2 - Math.PI / 2;
        ctx.fillStyle = 'rgba(128,128,128,0.55)';
        ctx.font = '9px system-ui';
        ctx.fillText(DOMAINS[k].replace(/^D\d+ /, ''), cx + Math.cos(a) * (R + 8) - 16, cy + Math.sin(a) * (R + 8) + 3);
      }
      const firedId = d?.templateId ?? null;
      const firedIdx = firedId ? h.skills.findIndex(s => s.id === firedId) : -1;
      for (let i = 0; i < total; i += stride) {
        const dIdx = bank.domain[i];
        const base = (dIdx / DOMAINS.length) * Math.PI * 2 - Math.PI / 2;
        const jitter = ((i / stride) % (total / stride / DOMAINS.length)) / Math.max(1, total / stride / DOMAINS.length);
        const r = R * (0.25 + 0.7 * ((i % stride * 7 + dIdx) % 10) / 10);
        const a = base + jitter * 0.45 - 0.22;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        const phaseAct = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(bank.phase[i] * 2));
        const amp = bank.amplitude[i];
        const fat = bank.fatigue[i];
        const isFired = i === firedIdx;
        const alpha = (0.15 + 0.5 * phaseAct * amp) * (1 - 0.7 * fat) + (isFired ? flash * 0.8 : 0);
        const radius = isFired ? 3.5 + flash * 3 : 1.2 + amp * 2.2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isFired
          ? `rgba(200,80,40,${Math.min(1, alpha + 0.3)})`
          : `rgba(140,140,140,${Math.min(1, alpha)})`;
        ctx.fill();
      }
      // coupling lines inside the active voice circuit
      if (h.activeCircuit?.length && firedIdx >= 0) {
        ctx.strokeStyle = `rgba(200,80,40,${0.25 + flash * 0.5})`;
        ctx.lineWidth = 1;
        for (const id of h.activeCircuit.slice(0, 8)) {
          const j = h.skills.findIndex(s => s.id === id);
          if (j < 0 || j === firedIdx) continue;
          const d0 = bank.domain[firedIdx], d1 = bank.domain[j];
          const a0 = (d0 / DOMAINS.length) * Math.PI * 2 - Math.PI / 2;
          const a1 = (d1 / DOMAINS.length) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a0) * R * 0.6, cy + Math.sin(a0) * R * 0.6);
          ctx.lineTo(cx + Math.cos(a1) * R * 0.6, cy + Math.sin(a1) * R * 0.6);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [height]);

  return <canvas ref={canvasRef} className={className} role="img"
    aria-label="Neuron map firing" />;
}
