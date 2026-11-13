// Vectorized oscillator bank for the Jev-Lattice.
//
// One bank holds N oscillators as flat typed arrays and updates all of them in
// one vectorized pass. There is never a per-oscillator LLM call: firing,
// coherence, refractory and fatigue are all array/matrix math.
//
// Phase update: phase = (phase + 2*PI*hz*step) % (2*PI)
// Coherence is a Gram matrix: coherence = V * V^T (computed for a candidate
// slice, never a pairwise JS loop over the whole bank).
// Lock resonance gating: a Mini Skill gates only when
//   phaseDiff < lockTolerance && coherence > lockThreshold
// so a skill with high embedding similarity but low phase lock does NOT gate.

export const TAU = Math.PI * 2;

export const DOMAINS = [
  'D01 Identity', 'D02 Resources', 'D03 Communication', 'D04 Home',
  'D05 Creation', 'D06 Work', 'D07 Partnership', 'D08 Transformation',
  'D09 Meaning', 'D10 Public Role', 'D11 Collective', 'D12 Subconscious',
];

// Writer-shaped funcs: voice and texture only. They never own structure.
export const FUNCS = [
  'Voice', 'CharacterVoice', 'Emotion', 'Flaw', 'WantVsNeed', 'Worldview',
  'Rhythm', 'Image', 'SceneObjective', 'OtherCharacters', 'WorldFacts',
  'PlotPressure', 'ReaderTension', 'Memory',
];

// Internal / external banks with default firing rates (Hz) per func.
export const INTERNAL_BANK_HZ = {
  Voice: 1.0, CharacterVoice: 0.8, Emotion: 0.4, Flaw: 0.08,
  WantVsNeed: 0.08, Worldview: 0.05, Rhythm: 1.2, Image: 0.5,
};
export const EXTERNAL_BANK_HZ = {
  SceneObjective: 1.0, OtherCharacters: 0.6, WorldFacts: 0.07,
  PlotPressure: 0.4, ReaderTension: 0.3, Memory: 0.05,
};

// Composition: V = V_domain + V_func + V_mode + V_stance + V_move + V_purpose.
export const MODES = ['draft', 'revise', 'probe', 'echo'];
export const STANCES = ['withheld', 'open', 'lyrical', 'clinical', 'wry'];
export const MOVES = ['compress', 'expand', 'contrast', 'echo', 'pivot'];
export const PURPOSES = ['tension', 'relief', 'revelation', 'mask', 'charge'];

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

// Deterministic embedding, no dependencies: rolling FNV-style hash into a
// normalized vector. Two equal strings always embed identically.
export function embed(text, dim = 64) {
  const v = new Float64Array(dim);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
    v[i % dim] += ((h & 0xffff) / 0xffff) * 2 - 1;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function defaultCalibration() {
  return {
    Vth: 0.65,
    noise: 0.05,              // never 0: two runs are never a replay
    fatigueDecayPerUse: 0.08, // fatigue added per use of an oscillator
    fatigueRecoveryPerTick: 0.02,
    couplingStrength: 0.5,
    gExt: 1.0, gSim: 0.3, gSelf: 0.5,
    lockTolerance: 0.4,       // rad, phase diff
    lockThreshold: 0.6,       // coherence
    parallelFiring: true,
    lockResonanceGating: true,
    tickLoop: true,
  };
}

export class OscillatorBank {
  constructor({ count, dim = 64, seed = 1, calibration }) {
    this.count = count;
    this.dim = dim;
    this.calibration = calibration ?? defaultCalibration();
    this.hz = new Float64Array(count);
    this.phase = new Float64Array(count);
    this.amplitude = new Float64Array(count);
    this.fatigue = new Float64Array(count);
    this.refractory = new Int32Array(count);
    this.coupling = new Float64Array(count);
    this.heat = new Float64Array(count); // V accumulator, decays when low coherence
    this.state = new Float64Array(count); // effective V after gains
    this.embedding = new Float64Array(count * dim);
    this.domain = new Int32Array(count);
    this.func = new Int32Array(count);
    this.meta = new Array(count);
    let rng = seed >>> 0 || 1;
    const next = () => { rng = (Math.imul(rng, 0x2c9f3fb5) + 0x9e3779b9) >>> 0; return rng / 0xffffffff; };
    for (let i = 0; i < count; i++) {
      this.phase[i] = next() * TAU;
      this.amplitude[i] = 0.2 + next() * 0.3;
      this.coupling[i] = next() * 0.2;
    }
  }

  // Register oscillator i with its composed identity. `tags` is the
  // composition V = V_domain + V_func + V_mode + V_stance + V_move + V_purpose.
  configure(i, { domain, func, hz, tags, label }) {
    this.domain[i] = domain;
    this.func[i] = func;
    this.hz[i] = hz;
    this.meta[i] = { domain, func, hz, label: label ?? `${DOMAINS[domain]}/${FUNCS[func]}` };
    const dim = this.dim;
    const v = this.embedding.subarray(i * dim, i * dim + dim);
    v.set(composeEmbedding(domain, func, tags, dim));
  }

  // One vectorized update over all oscillators. `input` is an array of I(t)
  // values, or null for silent input (g_ext drops, g_sim/g_self rise).
  step({ dt = 1, input = null, externalInput = null, simInput = null, selfInput = null }) {
    const c = this.calibration;
    const n = this.count;
    const gains = { gExt: externalInput ?? input, gSim: simInput, gSelf: selfInput };
    const silent = input === null && externalInput === null;
    const gExtEff = silent ? c.gExt * 0.15 : c.gExt;   // silence: g_ext drops
    const gSimEff = silent ? c.gSim * 2.0 : c.gSim;    // g_sim rises
    const gSelfEff = silent ? c.gSelf * 2.0 : c.gSelf; // g_self rises
    for (let i = 0; i < n; i++) {
      this.phase[i] = (this.phase[i] + TAU * this.hz[i] * dt) % TAU;
      if (this.refractory[i] > 0) this.refractory[i]--;
      const iExt = externalInput ? externalInput[i] ?? 0 : input ? input[i] ?? 0 : 0;
      const iSim = simInput ? simInput[i] ?? 0 : 0;
      const iSelf = selfInput ? selfInput[i] ?? 0 : 0;
      this.state[i] = gExtEff * iExt + gSimEff * iSim + gSelfEff * iSelf +
        c.noise * (Math.random() * 2 - 1);
      // V accumulates when coherence is high, decays when low (resolved below
      // after coherence is known; this is the leak toward the mean).
      this.heat[i] = this.heat[i] * 0.98 + this.state[i] * 0.02;
      this.amplitude[i] = clamp01(this.amplitude[i] + 0.01 * (this.state[i] - this.amplitude[i]));
      // fatigue recovery per tick (mask: refractory oscillators rest fully)
      if (this.refractory[i] === 0) {
        this.fatigue[i] = Math.max(0, this.fatigue[i] - c.fatigueRecoveryPerTick);
      }
    }
  }

  // coherence = V * V^T for the candidate indices, one matrix pass (not a
  // pairwise JS loop over the full bank).
  coherenceMatrix(indices) {
    const dim = this.dim, m = indices.length;
    const V = new Float64Array(m * dim);
    for (let a = 0; a < m; a++) {
      V.set(this.embedding.subarray(indices[a] * dim, indices[a] * dim + dim), a * dim);
    }
    const G = new Float64Array(m * m);
    for (let a = 0; a < m; a++) {
      const va = a * dim;
      for (let b = a; b < m; b++) {
        const vb = b * dim;
        let s = 0;
        for (let k = 0; k < dim; k++) s += V[va + k] * V[vb + k];
        G[a * m + b] = s; G[b * m + a] = s;
      }
    }
    return G;
  }

  // Grinder: one batched vector search. Embedding similarity of every
  // oscillator against the beat query in one pass, then phase-coherence term,
  // then top-K. Fatigue and refractory gate eligibility, never the search.
  retrieve(queryEmbedding, k = 8) {
    const n = this.count, dim = this.dim;
    const scores = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const base = i * dim;
      let s = 0;
      for (let d = 0; d < dim; d++) s += this.embedding[base + d] * queryEmbedding[d];
      const cosine = clamp01((s + 1) / 2); // embedding similarity 0..1
      // phase alignment against the query carrier (beat rhythm)
      const phaseAlign = 0.5 + 0.5 * Math.cos(this.phase[i]);
      scores[i] = cosine * (0.7 + 0.3 * phaseAlign) + this.coupling[i] * this.calibration.couplingStrength;
    }
    const idx = Array.from({ length: n }, (_, i) => i)
      .filter(i => this.refractory[i] === 0)
      .sort((a, b) => scores[b] - scores[a]);
    return { indices: idx.slice(0, k), scores };
  }

  // Lock resonance gating over retrieved candidates. Returns the subset that
  // actually gates: phaseDiff < lockTolerance AND coherence > lockThreshold.
  lockGate(indices, coherence) {
    const c = this.calibration;
    if (!c.lockResonanceGating) return indices.slice();
    const ref = indices[0] ?? -1;
    if (ref < 0) return [];
    const gated = [];
    for (let a = 0; a < indices.length; a++) {
      const i = indices[a];
      const phaseDiff = Math.abs(Math.atan2(Math.sin(this.phase[i] - this.phase[ref]),
        Math.cos(this.phase[i] - this.phase[ref])));
      const coh = coherence[a * indices.length + a]; // self coherence row (diag = 1) proxy
      const pairCoh = coherence[a * indices.length]; // vs reference skill
      if (phaseDiff < c.lockTolerance && pairCoh > c.lockThreshold) gated.push(i);
    }
    // A skill that never locks with anyone still gates alone when coherence
    // with the reference exceeds threshold; locked groups form voice circuits.
    return gated.length ? gated : indices.slice(0, 1);
  }

  // Vectorized firing decision for the active set. One pass, one matmul.
  // scores = s(t) @ W + b is Jev's job; here we produce the fire mask from Vth
  // over the heat accumulated per oscillator, pick the argmax, set refractory.
  fire(activeIndices, vth = this.calibration.Vth) {
    let best = -1, bestScore = -Infinity;
    for (const i of activeIndices) {
      const v = this.heat[i] * this.amplitude[i] * (1 - this.fatigue[i]) +
        this.calibration.noise * (Math.random() * 2 - 1) * 0.5;
      if (v >= vth && v > bestScore) { bestScore = v; best = i; }
    }
    const fired = best >= 0;
    if (fired) {
      this.heat[best] = 0;
      this.refractory[best] = 3;
      this.fatigue[best] = Math.min(1, this.fatigue[best] + this.calibration.fatigueDecayPerUse);
    }
    return { fired, index: best, score: fired ? bestScore : 0 };
  }

  averages(indices) {
    if (!indices.length) return { fatigue: 0, coherence: 0 };
    let f = 0;
    for (const i of indices) f += this.fatigue[i];
    return { fatigue: f / indices.length, coherence: 0 };
  }
}

// Compose the embedding of an oscillator from its six tag vectors.
export function composeEmbedding(domain, func, tags = {}, dim = 64) {
  const parts = [];
  parts.push(`domain:${DOMAINS[domain] ?? domain}`);
  parts.push(`func:${FUNCS[func] ?? func}`);
  if (tags.mode) parts.push(`mode:${tags.mode}`);
  if (tags.stance) parts.push(`stance:${tags.stance}`);
  if (tags.move) parts.push(`move:${tags.move}`);
  if (tags.purpose) parts.push(`purpose:${tags.purpose}`);
  if (tags.text) parts.push(tags.text);
  return embed(parts.join('|'), dim);
}
