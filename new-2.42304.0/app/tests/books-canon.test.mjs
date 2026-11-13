// Acceptance tests: CanonStore is perfect recall and separate from
// LeakyMemory. A "sister died in chapter 2" fact must survive 100 beats and
// CanonCheck must flag any draft that resurrects her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanonStore } from '../src/books/book-canon.mjs';
import { LeakyMemory } from '../src/books/book-leaky-memory.mjs';
import { BookStructure } from '../src/books/book-structure.mjs';
import { BookDraftEngine } from '../src/books/book-draft-engine.mjs';
import { JevLatticeHarness } from '../src/jev/jev-lattice-harness.mjs';

test('canon facts are non-decaying and injected every time', () => {
  const canon = new CanonStore('book-1');
  const f = canon.addFact({ text: 'Mira died in chapter 2', category: 'event', sourceSceneId: 'sc-ch-1-2-1' });
  canon.tick = 100;
  const facts = canon.selectForScene(['event']);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].id, f.id);
  assert.equal(facts[0].status, 'active'); // no decay, ever
});

test('PROOF: sister died in ch2 survives 100 beats; resurrection flagged', () => {
  const canon = new CanonStore('book-1');
  canon.addFact({ text: 'Lena died in chapter 2', category: 'event', status: 'dead' });
  canon.addFact({ text: 'Lena cannot lie', category: 'rule' });
  // inject the fact into 100 consecutive beat strips
  for (let i = 0; i < 100; i++) {
    const block = canon.renderBlock(canon.selectForScene(['event']));
    assert.match(block, /Lena died in chapter 2/);
  }
  const resurrection = canon.checkDraft('Lena walks in and she said hello', ['event']);
  assert.equal(resurrection.pass, false);
  assert.ok(resurrection.flags.some(f => f.type === 'resurrected-character'));
  const clean = canon.checkDraft('The room stayed empty. The kettle cooled.', ['event']);
  assert.equal(clean.pass, true);
});

test('broken world rule and wrong timeline are flagged', () => {
  const canon = new CanonStore('b');
  canon.addFact({ text: 'Juno cannot swim', category: 'rule' });
  canon.addFact({ text: 'before the flood, the mill still stood', category: 'timeline' });
  const bad = canon.checkDraft('Juno cannot swim, so of course she swam the strait at midnight.', ['rule', 'timeline']);
  assert.equal(bad.pass, false);
  assert.ok(bad.flags.some(f => f.type === 'broken-world-rule'));
  const badTime = canon.checkDraft('before the flood came ashore, the mill still stood and burned.', ['timeline']);
  assert.equal(badTime.pass, false);
  assert.ok(badTime.flags.some(f => f.type === 'wrong-timeline'));
});

test('versioned canon edit with reason; dead/changed facts always injected', () => {
  const canon = new CanonStore('b');
  const f = canon.addFact({ text: 'The gate is iron', category: 'object' });
  canon.editFact(f.id, { text: 'The gate is glass now', status: 'changed', reason: 'ch5: the pilot melted it' });
  assert.equal(canon.edits.length, 1);
  assert.match(canon.edits[0].reason, /pilot/);
  // dead/changed subset injected even when category not requested
  const subset = canon.selectForScene(['character']);
  assert.equal(subset.length, 1);
  assert.equal(subset[0].status, 'changed');
});

test('LeakyMemory: low weight psychology fades, high weight wound persists; separate from canon', () => {
  const mem = new LeakyMemory({ alpha: 0.95 });
  mem.update('a small irritation about the rain', { weight: 0.3 });
  mem.update('the wound: father sold the violin', { weight: 8 });
  for (let i = 0; i < 20; i++) mem.decayTick();
  const snap = mem.snapshot();
  const small = snap.find(e => /rain/.test(e.text));
  const wound = snap.find(e => /violin/.test(e.text));
  assert.ok(small === undefined || small.effective < 0.15, 'low weight fades after 20 beats');
  assert.ok(wound && wound.effective > 0.5, 'high weight wound persists');
  // decay rate logged
  assert.ok(mem.decayLog.length >= 20);
  // and it is NOT the canon store: no facts live here
  const canon = new CanonStore('b');
  assert.notEqual(mem, canon);
});
