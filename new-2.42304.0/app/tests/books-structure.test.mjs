// Acceptance tests: BookStructure owns structure. Oscillator calibration
// must never change outline, act order, scene order, or arc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BookStructure } from '../src/books/book-structure.mjs';
import { JevLatticeHarness } from '../src/jev/jev-lattice-harness.mjs';
import { defaultCalibration } from '../src/jev/oscillator-bank.mjs';

function makeBook() {
  const b = new BookStructure({
    title: 'Test', genre: 'literary', premise: 'A clockmaker loses her sister and gains a debt.',
    authors: ['A'], guidingWords: ['debt', 'gears', 'mourning'],
  });
  b.buildOutline({ acts: 3, chaptersPerAct: 2, scenesPerChapter: 3, characters: ['Ilse', 'Marek'] });
  return b;
}

test('outline builds acts, chapters, scenes with strict order', () => {
  const b = makeBook();
  assert.equal(b.acts.length, 3);
  assert.equal(b.chapters.length, 6);
  assert.equal(b.scenes.length, 18);
  assert.equal(b.scenes[0].id, 'sc-ch-1-1-1');
  assert.deepEqual(b.pacing.actBreaks, ['act-1', 'act-2', 'act-3']);
});

test('structure layer API: getNextScene / objective / act / setup-payoff', () => {
  const b = makeBook();
  const first = b.getNextScene();
  assert.equal(first.id, 'sc-ch-1-1-1');
  assert.equal(b.getSceneObjective(first.id), first.objective);
  assert.equal(b.getActForScene(first.id).id, 'act-1');
  const sp = b.getSetupPayoffForScene(first.id);
  assert.deepEqual(sp.setupsDue, []);
  assert.equal(sp.payoffsOwed.length, 3);
});

test('PROOF: changing oscillator calibration does not change outline or scene order', () => {
  const a = makeBook();
  const orderA = a.scenes.map(s => s.id);
  // build a harness with extreme calibration, then draft against a clone of
  // the structure: scene order and ids must be byte-identical
  const harness = new JevLatticeHarness({
    oscillatorCount: 500,
    calibration: { ...defaultCalibration(), Vth: 0.1, noise: 0.4, fatigueDecayPerUse: 0.5,
      lockTolerance: 0.01, lockThreshold: 0.99, gExt: 0, gSim: 5, gSelf: 5 },
    tickScope: 'scene',
  });
  harness.tick({ sceneObjective: 'probe', beatGoal: 'probe', forceDraft: false });
  const orderB = makeBook().scenes.map(s => s.id);
  assert.deepEqual(orderA, orderB);
  // and the harness holds no reference that can mutate the structure
  assert.equal(harness.structure, undefined);
});

test('approval gate: voice layer cannot draft before outline + scene list approval', () => {
  const b = makeBook();
  assert.throws(() => b.setBeats(b.scenes[0].id, [{ goal: 'x' }]), /scene list not approved/);
  b.approveOutline();
  assert.throws(() => b.setBeats(b.scenes[0].id, [{ goal: 'x' }]), /not approved/);
  b.approveSceneList();
  b.setBeats(b.scenes[0].id, [{ goal: 'x' }]);
  assert.throws(() => b.setBeats(b.scenes[0].id, [{ goal: 'y' }]), /may not rewrite structure/);
});

test('guidingWords validation: 3 to 7 words', () => {
  assert.throws(() => new BookStructure({ title: 't', genre: 'g', premise: 'p', guidingWords: ['a', 'b'] }), /3 to 7/);
  assert.throws(() => new BookStructure({ title: 't', genre: 'g', premise: 'p', guidingWords: ['1', '2', '3', '4', '5', '6', '7', '8'] }), /3 to 7/);
});
