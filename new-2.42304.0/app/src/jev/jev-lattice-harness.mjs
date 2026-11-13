// Jev-Lattice harness. Class JevLatticeHarness.
// Holds oscillators, memory, world model, Strip builder, plugins, maps.
// The harness runs the tick loop where a tick = a beat (or a scene, if the
// calibration toggles Jev per scene). One Jev call per tick, never per
// sentence, never per oscillator.

import { OscillatorBank, defaultCalibration, DOMAINS, FUNCS,
  TAU } from './oscillator-bank.mjs';
import { craftCoreSkills, beatQueryEmbedding, DIM } from './mini-skills.mjs';
import { JevDecisionModel } from './jev-decision-model.mjs';

// World model: for each domain a predictor answers "what does the world do
// here — rules, costs, limits, what happens if you act". State: otherAgent.
// Predictor: given the last thought, output the predicted next external input
// as I_sim. Fast loop: thought -> predict -> prediction becomes I_sim -> next
// thought reacts. Medium loop: error = actual minus predicted; error updates
// coupling.
export class WorldModel {
  constructor({ domains = DOMAINS.length } = {}) {
    this.rules = new Array(domains).fill(null).map((_, d) => ({
      domain: d,
      cost: 'acting in this domain costs standing',
      limit: 'the world resists repeated moves in the same domain',
      response: 'the world answers with friction, not catastrophe',
    }));
    this.otherAgent = { want: null, need: null, flaw: null, lastAction: null, predictedNextAction: null };
    this.lastPrediction = null;
    this.predictionError = 0;
  }

  setOtherAgent(patch) { Object.assign(this.otherAgent, patch); }

  // Fast loop: predict the next external input from the last thought.
  predictNextInput(lastThought, domain = 0) {
    const rule = this.rules[domain % this.rules.length];
    const predictedNextAction = lastThought
      ? `the world pushes back on: ${lastThought.slice(0, 48)}`
      : rule.response;
    this.lastPrediction = predictedNextAction;
    this.otherAgent.predictedNextAction = predictedNextAction;
    return { iSimText: predictedNextAction, otherAgent: { ...this.otherAgent } };
  }

  // Medium loop: error = actual minus predicted; error updates coupling.
  observeActual(actual, onCouplingDelta) {
    if (this.lastPrediction == null) return 0;
    const same = actual != null && actual.includes(this.lastPrediction.slice(0, 24));
    const error = same ? 0 : 1;
    this.predictionError = this.predictionError * 0.7 + error * 0.3;
    if (onCouplingDelta) onCouplingDelta(this.predictionError * 0.05);
    return this.predictionError;
  }
}

// LeakyMemory adapter surface (the real class lives in /books, injected).
// The harness only requires: getBlock(), update(text, weight), decayTick().

export class JevLatticeHarness {
  constructor({
    oscillatorCount = 2000,
    calibration = defaultCalibration(),
    leakyMemory = null,
    jev = null,
    seed = 3,
    tickScope = 'beat', // 'beat' | 'scene'  (Jev per beat vs Jev per scene)
  } = {}) {
    this.calibration = { ...defaultCalibration(), ...calibration };
    this.tickScope = tickScope;
    this.bank = new OscillatorBank({ count: oscillatorCount, dim: DIM, seed, calibration: this.calibration });
    this.skills = craftCoreSkills(oscillatorCount, seed);
    for (let i = 0; i < oscillatorCount; i++) {
      const s = this.skills[i];
      this.bank.configure(i, {
        domain: s.domain, func: s.func, hz: s.hz,
        tags: { stance: 'open', move: 'expand', purpose: 'tension' },
        label: s.id,
      });
      s.oscillatorId = `osc-${i}`;
    }
    this.jev = jev ?? new JevDecisionModel({ Vth: this.calibration.Vth, noise: this.calibration.noise });
    this.leakyMemory = leakyMemory;
    this.worldModel = new WorldModel();
    this.plugins = [];
    this.beatIndex = 0;
    this.silenceTickCount = 0;
    this.lastThought = null;
    this.lastDecision = null;
    this.lastStrip = null;
    this.activeCircuit = [];
    this.fired = false; // whether last tick produced a Jev fire
    this.fireLog = [];  // proof: one Jev call per tick (beat/scene), not per sentence
  }

  registerPlugin(plugin) { this.plugins.push(plugin); }

  // One tick = one beat. `beat` = { sceneObjective, beatGoal, recentText,
  // canonBlock, userInput, worldDomain }. This is the sequential part:
  // Jev decides, then Main Brain renders if Jev.fire. Everything inside one
  // beat is parallel (vectorized bank update, batched retrieval, one matmul).
  tick(beat = {}) {
    const c = this.calibration;
    const t0 = Date.now();
    // 1. vectorized bank step; silence handling drops g_ext, raises g_sim/g_self
    const userInput = beat.userInput ?? null;
    const silent = !userInput && !beat.sceneObjective;
    const n = this.bank.count;
    this.bank.step({
      input: null,
      externalInput: silent ? null : new Float64Array(n).fill(0.4),
      simInput: silent ? new Float64Array(n).fill(0.2) : null,
      selfInput: silent ? new Float64Array(n).fill(0.15) : null,
    });
    if (silent) this.silenceTickCount++; else this.silenceTickCount = 0;
    // 2. world model fast loop: last thought becomes I_sim
    const predicted = this.worldModel.predictNextInput(this.lastThought, beat.worldDomain ?? 0);
    // 3. grinder: one batched vector search, top K = 8..16
    const query = beatQueryEmbedding({ sceneObjective: beat.sceneObjective,
      beatGoal: beat.beatGoal, recentText: beat.recentText });
    const k = beat.topK ?? 12;
    const { indices } = this.bank.retrieve(query, k);
    const coherence = this.bank.coherenceMatrix(indices);
    // 4. lock resonance gating: forms a voice circuit for this beat
    const gated = this.bank.lockGate(indices, coherence);
    this.activeCircuit = gated.map(i => this.skills[i].id);
    // 5. build the state vector features for Jev
    const activeSkills = gated.map(i => ({
      id: this.skills[i].id,
      coherence: coherence[0 * indices.length + indices.indexOf(i)] ?? 0.5,
      phaseAlign: 0.5 + 0.5 * Math.cos(this.bank.phase[i]),
      memoryWeight: this.leakyMemory?.stateWeight?.() ?? 0,
      fatigue: this.bank.fatigue[i],
      cost: (this.bank.func[i] === FUNCS.indexOf('Emotion') ? 0.4 : 0.2),
      coupling: this.bank.coupling[i],
    }));
    const state = {
      activeSkills, tickType: this.tickScope, beatIndex: this.beatIndex,
      sceneId: beat.sceneId ?? null, silenceTickCount: this.silenceTickCount,
      userInput, gains: { gExt: c.gExt, gSim: c.gSim, gSelf: c.gSelf },
      predictionError: this.worldModel.predictionError,
    };
    // 6. ONE Jev call for this beat
    const decision = this.jev.decide(state);
    this.lastDecision = decision;
    this.fireLog.push({ tick: this.beatIndex, type: 'jev-call', tickType: this.tickScope,
      fired: decision.fire, templateId: decision.templateId });
    this.fired = decision.fire;
    // fired skill accrues fatigue and refractory (per-use cost, drives shift)
    if (decision.fire && decision.templateId) {
      const idx = this.skills.findIndex(s => s.id === decision.templateId);
      if (idx >= 0) {
        this.bank.fatigue[idx] = Math.min(1, this.bank.fatigue[idx] + this.calibration.fatigueDecayPerUse);
        this.bank.refractory[idx] = 2;
      }
    }
    // 7. build the Strip (one concat, not K LLM calls)
    const strip = decision.fire || beat.forceDraft
      ? this.buildStrip({ beat, indices: gated, decision })
      : null;
    this.lastStrip = strip;
    // 8. watchdog: no spike for 10 ticks -> inject self prompt
    if (this.silenceTickCount >= 10 && !decision.fire) {
      decision.evaluation = 'watchdog-inject-self';
      decision.fire = true;
    }
    // 9. beat-to-beat fatigue recovery already handled in bank.step
    this.beatIndex++;
    const t1 = Date.now();
    return { decision, strip, circuit: this.activeCircuit, durationMs: t1 - t0 };
  }

  // Strip = Canon block + Scene objective + one Mini Skill fragment per active
  // oscillator + LeakyMemory block + Anti-slop bans + Output rules.
  buildStrip({ beat, indices, decision }) {
    const c = this.calibration;
    const parts = [];
    parts.push(beat.canonBlock ?? 'CANON - DO NOT CONTRADICT\n(no canon facts selected)');
    parts.push(`SCENE OBJECTIVE: ${beat.sceneObjective ?? '(none)'}`);
    parts.push(`BEAT GOAL: ${beat.beatGoal ?? '(none)'}`);
    const banned = new Set();
    for (const i of indices) {
      const s = this.skills[i];
      parts.push(`VOICE SKILL ${s.id}: ${s.promptFragment}`);
      for (const p of s.bannedPhrases) banned.add(p);
    }
    parts.push('LEAKY MEMORY (psychology only, decays; never facts):\n' +
      (this.leakyMemory?.getBlock?.() ?? '(empty)'));
    parts.push('ANTI-SLOP BANS: ' + [...banned].join(', '));
    parts.push(`OUTPUT RULES: honor the scene objective; canon is law; noise is allowed in voice, not in facts; shift=${decision.shift}`);
    const strip = parts.join('\n\n');
    for (const p of this.plugins) p.onStrip?.(strip, decision);
    return strip;
  }

  // After Main Brain renders: evaluate, reward Jev, update coupling/memory.
  settle({ draftText, userInput, reward }) {
    const err = this.worldModel.observeActual(userInput ?? draftText, delta => {
      for (let i = 0; i < this.bank.count; i++) {
        this.bank.coupling[i] = Math.max(0, Math.min(1, this.bank.coupling[i] + delta));
      }
    });
    if (reward === undefined) {
      reward = evaluateDraftSignals(draftText ?? '');
    }
    this.jev.applyReward(reward);
    this.leakyMemory?.update?.(draftText ?? '');
    this.leakyMemory?.decayTick?.();
    this.lastThought = (draftText ?? '').split(/(?<=[.!?])\s+/).slice(-1)[0] ?? this.lastThought;
    return { reward, predictionError: err };
  }

  readout(indices) {
    const avg = this.bank.averages(indices ?? []);
    return {
      fireRate: this.fireLog.length ? this.fireLog.filter(f => f.fired).length / this.fireLog.length : 0,
      coherenceAverage: avg.coherence,
      fatigueAverage: avg.fatigue,
      lastJevDecision: this.lastDecision,
    };
  }
}

// Cheap, dependency-free draft signal evaluation used as the default reward.
export function evaluateDraftSignals(text) {
  if (!text || !text.trim()) return -1;
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const varied = lengths.length > 1 && Math.abs(lengths[0] - lengths[lengths.length - 1]) > 3;
  const repeated = /(the same|again, again|suddenly)/i.test(text);
  return (varied ? 1 : 0) + (repeated ? -1 : 0) || 0;
}
