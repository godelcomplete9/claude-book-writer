// Jev: one decision model with weights. Class JevDecisionModel.
// One instance per session. Input is a state vector; output is one decision
// JSON. It does NOT write prose and it NEVER decides canon, outline, act
// order, or scene order — only voice and texture for the current beat.
//
// Forward pass (vectorized, all candidate templates at once):
//   scores = s(t) @ W + b, one matmul, no per-template loops with prompts.
//   score = w_coherence*coherence + w_phase*phaseAlignment + w_memory*memory
//         - w_fatigue*fatigue - w_cost*emotionalCost + w_coupling*coupling + noise
// Threshold: if max score < Vth, gate stays low, fire = false. V accumulates
// when coherence is high, decays when low. When V >= Vth: spike, fire = true,
// reset V, set refractory.

export class JevDecisionModel {
  constructor({ Vth = 0.65, noise = 0.05, learningRate = 0.01, seed = 11 } = {}) {
    this.Vth = Vth;
    this.noise = noise;
    this.learningRate = learningRate;
    this.W = new Float64Array(8); // weights over the state features
    this.W.set([0.9, 0.6, 0.5, -0.7, -0.4, 0.5, 0.2, 0.1]);
    this.b = 0.1;
    this.V = 0;          // membrane potential accumulator
    this.refractory = 0;
    this.tickCount = 0;
    this.log = [];
    let rng = seed >>> 0 || 1;
    this.noiseNext = () => { rng = (Math.imul(rng, 0x2c9f3fb5) + 0x9e3779b9) >>> 0; return (rng / 0xffffffff) * 2 - 1; };
  }

  // JevState -> JevDecision (JSON only, no prose).
  // state = {
  //   activeSkills: [{ id, coherence, phaseAlign, memoryWeight, fatigue, cost, coupling }],
  //   tickType: 'beat' | 'scene',
  //   beatIndex, sceneId, silenceTickCount, userInput
  // }
  decide(state) {
    this.tickCount++;
    if (this.refractory > 0) this.refractory--;
    const skills = state.activeSkills ?? [];
    const n = skills.length || 1;
    const S = new Float64Array(8);
    for (const s of skills) {
      S[0] += s.coherence ?? 0;
      S[1] += s.phaseAlign ?? 0;
      S[2] += s.memoryWeight ?? 0;
      S[3] += s.fatigue ?? 0;
      S[4] += s.cost ?? 0;
      S[5] += s.coupling ?? 0;
      S[6] += state.silenceTickCount ?? 0;
      S[7] += state.userInput ? 1 : 0;
    }
    for (let k = 0; k < 8; k++) S[k] /= n;
    // scores = s(t) @ W + b, one matmul over the feature vector
    const score = S[0] * this.W[0] + S[1] * this.W[1] + S[2] * this.W[2] +
      S[3] * this.W[3] + S[4] * this.W[4] + S[5] * this.W[5] +
      S[6] * this.W[6] + S[7] * this.W[7] + this.b + this.noise * this.noiseNext();
    // membrane: V accumulates with coherence, decays otherwise
    this.V += (S[0] > 0.6 ? 0.15 : -0.1);
    if (this.V < 0) this.V = 0;
    const fire = this.refractory === 0 && (score >= this.Vth || this.V >= this.Vth);
    if (fire) { this.V = 0; this.refractory = 2; }
    let templateId = null;
    if (fire && skills.length) {
      let best = -Infinity;
      for (const s of skills) {
        const v = (s.coherence ?? 0) * this.W[0] + (s.phaseAlign ?? 0) * this.W[1] +
          (s.memoryWeight ?? 0) * this.W[2] - (s.fatigue ?? 0) * Math.abs(this.W[3]) +
          (s.coupling ?? 0) * this.W[5] + this.noise * this.noiseNext();
        if (v > best) { best = v; templateId = s.id; }
      }
    }
    const shift = (state.silenceTickCount ?? 0) >= 10 ? 'self'
      : !state.userInput && (state.silenceTickCount ?? 0) >= 3 ? 'sim' : 'ext';
    const decision = {
      gate: Math.max(0, Math.min(1, score)),
      fire,
      templateId,
      shift,
      couplingDelta: fire ? { default: 0.01 } : {},
      gainDelta: fire ? { gSelf: shift === 'self' ? 0.05 : 0 } : {},
      evaluation: fire ? 'proceed-to-draft' : 'hold-voice',
      confidence: Math.max(0, Math.min(1, Math.abs(score))),
      tickType: state.tickType ?? 'beat',
      beatIndex: state.beatIndex ?? 0,
      sceneId: state.sceneId ?? null,
    };
    this.log.push({ tick: this.tickCount, ...decision, reward: null });
    return decision;
  }

  // Learning: reward +1 for motivated contradiction / forgetting of psychology
  // / avoidance / fatigue-driven shift / voice variety; -1 for unmotivated
  // contradiction, canon contradiction, flat rhythm, repeated phrasing.
  applyReward(reward) {
    const last = this.log[this.log.length - 1];
    if (!last || last.reward !== null) return;
    last.reward = reward;
    const lr = this.learningRate;
    // tiny, bounded weight update toward the reward
    for (let k = 0; k < this.W.length; k++) {
      this.W[k] = Math.max(-2, Math.min(2, this.W[k] + lr * reward * (k < 3 ? 1 : -1) * 0.25));
    }
  }

  recentLog(n = 20) { return this.log.slice(-n); }
}
