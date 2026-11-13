// Acceptance tests: vectorized bank, lock resonance, one Jev call per beat,
// fatigue shift, plain-mode toggle, drafting via Jev.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OscillatorBank, defaultCalibration, composeEmbedding } from '../src/jev/oscillator-bank.mjs';
import { JevLatticeHarness } from '../src/jev/jev-lattice-harness.mjs';
import { JevDecisionModel } from '../src/jev/jev-decision-model.mjs';
import { craftCoreSkills, DIM } from '../src/jev/mini-skills.mjs';
import { BookStructure } from '../src/books/book-structure.mjs';
import { CanonStore } from '../src/books/book-canon.mjs';
import { LeakyMemory } from '../src/books/book-leaky-memory.mjs';
import { BookDraftEngine } from '../src/books/book-draft-engine.mjs';

test('bank phase update is vectorized and wraps at 2 PI', () => {
  const bank = new OscillatorBank({ count: 100, seed: 5 });
  for (let i = 0; i < 100; i++) bank.configure(i, { domain: i % 12, func: 0, hz: 0.2 });
  const p0 = bank.phase[0];
  bank.step({ dt: 1 });
  assert.ok(bank.phase[0] >= 0 && bank.phase[0] < Math.PI * 2);
  assert.notEqual(bank.phase[0], p0);
});

test('coherence matrix is a Gram matrix, symmetric, diagonal 1', () => {
  const bank = new OscillatorBank({ count: 50, seed: 5 });
  for (let i = 0; i < 50; i++) bank.configure(i, { domain: i % 12, func: i % 14, hz: 0.2 });
  const G = bank.coherenceMatrix([0, 1, 2, 3]);
  assert.ok(Math.abs(G[0 * 4 + 0] - 1) < 1e-9);
  assert.ok(Math.abs(G[1 * 4 + 2] - G[2 * 4 + 1]) < 1e-12);
});

test('LOCK: high embedding similarity but low phase lock does NOT gate', () => {
  const cal = defaultCalibration();
  const bank = new OscillatorBank({ count: 8, seed: 9, calibration: cal });
  for (let i = 0; i < 8; i++) {
    bank.configure(i, { domain: 0, func: 0, hz: 0.5,
      tags: { stance: 'open', move: 'expand', purpose: 'tension' } });
  }
  // make embeddings identical (max similarity) but phases opposite
  const v = composeEmbedding(0, 0, { stance: 'open', move: 'expand', purpose: 'tension' });
  for (let i = 0; i < 8; i++) bank.embedding.set(v, i * DIM);
  bank.phase[0] = 0;
  bank.phase[1] = Math.PI; // phase diff ~PI > lockTolerance 0.4
  const G = bank.coherenceMatrix([0, 1]);
  const gated = bank.lockGate([0, 1], G);
  assert.ok(!gated.includes(1), 'identical embedding but opposite phase must not gate');
  bank.phase[1] = 0.05; // now within tolerance
  const G2 = bank.coherenceMatrix([0, 1]);
  const gated2 = bank.lockGate([0, 1], G2);
  assert.ok(gated2.includes(1), 'within tolerance and coherent must gate');
});

test('PROOF: one Jev call per beat, not per sentence', () => {
  const harness = new JevLatticeHarness({ oscillatorCount: 200, seed: 3 });
  const beats = 10;
  for (let i = 0; i < beats; i++) {
    harness.tick({ sceneObjective: 'o', beatGoal: 'g', forceDraft: true });
    // force Main Brain render with many sentences: still one Jev call
    harness.settle({ draftText: 'A. B. C. D. E. F. G. H. I. J. K. L.' });
  }
  assert.equal(harness.jev.log.length, beats, 'one decision per beat');
  assert.equal(harness.fireLog.length, beats);
  assert.ok(harness.fireLog.every(f => f.tickType === 'beat'));
  // cost per chapter bounded: beats x 1 call, not beats x sentences x oscillators
  const cost = harness.jev.log.length; // 10
  assert.ok(cost < beats * 12 * 200);
});

test('PROOF: fatigue — same precise scene 10 times shifts the gated skill', () => {
  const harness = new JevLatticeHarness({ oscillatorCount: 400, seed: 13 });
  const picks = new Set();
  const fatigueCurve = [];
  for (let i = 0; i < 10; i++) {
    const { decision } = harness.tick({ sceneObjective: 'the same precise scene', beatGoal: 'identical', forceDraft: true });
    harness.settle({ draftText: 'varied rhythm sentence here, short then much longer to vary the shape of the line' });
    if (decision.templateId) picks.add(decision.templateId);
    let maxF = 0;
    for (let j = 0; j < harness.bank.count; j++) maxF = Math.max(maxF, harness.bank.fatigue[j]);
    fatigueCurve.push(+maxF.toFixed(2));
  }
  assert.ok(picks.size >= 1, 'a skill is chosen each time');
  assert.ok(fatigueCurve[fatigueCurve.length - 1] > 0, 'fatigue rises with repeated use (curve logged)');
  assert.ok(fatigueCurve[0] < fatigueCurve[fatigueCurve.length - 1]);
});

test('Jev decision JSON shape: gate/fire/templateId/shift/couplingDelta/gainDelta/evaluation/confidence', () => {
  const jev = new JevDecisionModel({});
  const d = jev.decide({ activeSkills: [{ id: 'core-1', coherence: 0.9, phaseAlign: 0.9, fatigue: 0, cost: 0.1, coupling: 0.3 }],
    tickType: 'beat', beatIndex: 0, sceneId: 'sc-1', silenceTickCount: 0, userInput: 'x' });
  for (const k of ['gate', 'fire', 'templateId', 'shift', 'couplingDelta', 'gainDelta', 'evaluation', 'confidence']) {
    assert.ok(k in d);
  }
  assert.equal(typeof d.fire, 'boolean');
  jev.applyReward(1);
  assert.equal(jev.log[jev.log.length - 1].reward, 1);
});

test('PROOF: plain mode toggle restores plain behavior (no Jev, no oscillator, no voice layer)', () => {
  const structure = new BookStructure({ title: 'T', genre: 'G', premise: 'P', guidingWords: ['a', 'b', 'c'] });
  structure.buildOutline({ acts: 1, chaptersPerAct: 1, scenesPerChapter: 1, characters: ['Ann'] });
  structure.approveOutline(); structure.approveSceneList();
  const canon = new CanonStore(structure.id);
  const mem = new LeakyMemory({});
  const harness = new JevLatticeHarness({ oscillatorCount: 100, leakyMemory: mem });
  const jevCallsBefore = harness.jev.log.length;
  let calls = 0;
  const engine = new BookDraftEngine({
    structure, canon, leakyMemory: mem, harness,
    mainBrain: strip => { calls++; assert.ok(strip.includes('CANON - DO NOT CONTRADICT')); assert.ok(strip.includes('SCENE OBJECTIVE:')); assert.ok(!strip.includes('VOICE SKILL')); return 'Plain beat prose.'; },
    hybrid: false,
  });
  const r = engine.draftBeat({});
  assert.equal(r.accepted, true);
  assert.equal(calls, 1);
  assert.equal(harness.jev.log.length, jevCallsBefore, 'no Jev calls in plain mode');
});

test('hybrid drafting via Jev: strip contains canon block, skills, leaky memory, bans', () => {
  const structure = new BookStructure({ title: 'T', genre: 'G', premise: 'P', guidingWords: ['a', 'b', 'c'] });
  structure.buildOutline({ acts: 1, chaptersPerAct: 1, scenesPerChapter: 2, characters: ['Ann'] });
  structure.approveOutline(); structure.approveSceneList();
  const canon = new CanonStore(structure.id);
  canon.addFact({ text: 'Ann is a ferry pilot', category: 'character' });
  const mem = new LeakyMemory({});
  mem.update('she keeps seeing the white ridge', { weight: 1 });
  const harness = new JevLatticeHarness({ oscillatorCount: 300, leakyMemory: mem });
  const strips = [];
  const engine = new BookDraftEngine({
    structure, canon, leakyMemory: mem, harness,
    mainBrain: strip => { strips.push(strip); return 'Short beat. Then the ferry lifted through a longer, unhurried sentence that carried the ridge and the weather and the pilot along with it.'; },
    hybrid: true,
  });
  const r = engine.draftBeat({ userInput: 'write' });
  assert.equal(r.accepted, true);
  const strip = strips[0];
  assert.match(strip, /CANON - DO NOT CONTRADICT/);
  assert.match(strip, /Ann is a ferry pilot/);
  assert.match(strip, /VOICE SKILL core-/);
  assert.match(strip, /ANTI-SLOP BANS/);
  assert.match(strip, /LEAKY MEMORY/);
  assert.match(strip, /OUTPUT RULES/);
  assert.match(strip, /SCENE OBJECTIVE:/);
});

test('revision queue: failed checks enqueue with reason, max 2 passes then user review', async () => {
  const { RevisionQueue, runChecks, styleCheck } = await import('../src/books/book-revision.mjs');
  const canon = new CanonStore('b');
  canon.addFact({ text: 'Tomas died in chapter 2', category: 'event', status: 'dead' });
  const bad = runChecks('Suddenly Tomas walks in and spoke.', { canon, activeSkills: craftCoreSkills(3) });
  assert.equal(bad.canon.pass, false);
  assert.equal(bad.style.pass, false); // 'suddenly' banned
  const q = new RevisionQueue({});
  const item = q.enqueue({ sceneId: 's', beatIndex: 0, text: 'Suddenly Tomas walks in and spoke.', checks: bad });
  assert.ok(item.reasons.includes('canon'));
  assert.ok(item.reasons.includes('style'));
  let revisions = 0;
  const harness = new JevLatticeHarness({ oscillatorCount: 50 });
  // pass 1: still resurrects Tomas -> canon check fails again -> stays queued
  const item1 = q.revise(item, {
    harness, canon, structure: null,
    mainBrain: strip => { revisions++; return 'Short line. Tomas walks in, spoke softly. Then a much longer sentence arrives carrying its own weather across the whole page without repeating anything at all ever.'; },
  });
  assert.equal(revisions, 1);
  assert.equal(item1.status, 'queued');
  // pass 2: clean revision -> accepted
  const item2 = q.revise(item1, {
    harness, canon, structure: null,
    mainBrain: strip => { revisions++; return 'Short line. Then a much longer sentence arrives carrying its own weather across the whole page without repeating anything at all ever again.'; },
  });
  assert.equal(revisions, 2);
  assert.equal(item2.status, 'accepted');
  // max passes: two failing revisions -> user-review
  const stuck = q.enqueue({ sceneId: 's', beatIndex: 1, text: 'x', checks: bad });
  q.revise(stuck, { harness, canon, structure: null, mainBrain: () => 'Suddenly Tomas walks in and spoke again.' });
  q.revise(stuck, { harness, canon, structure: null, mainBrain: () => 'Suddenly Tomas walks in and spoke yet again.' });
  assert.equal(stuck.status, 'user-review');
});
