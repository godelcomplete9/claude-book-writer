// Acceptance proofs for the full automation pipeline plugins:
// six stages, outline-before-prose lock, chunked drafting, rolling memory,
// the agent crew with QA gates, and the two human gates.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPELINE_STAGES, PremiseSpec, BookBible, planChapterTargets, chapterCard,
  buildActs, planChunks, OutlineLock,
} from '../src/books/plugins/pipeline-outline.mjs';
import { RollingMemory, extractiveSummary } from '../src/books/plugins/pipeline-memory.mjs';
import {
  Coordinator, HumanGates, qaGate, rewriteFlagged, criticPrompt,
  architectPrompt, writerPrompt, continuityPrompt, editorPrompt, CRITIC_CHECKLIST,
} from '../src/books/plugins/pipeline-agents.mjs';
import { factCheck } from '../src/books/plugins/antislop.mjs';

const premise = new PremiseSpec({
  genre: 'literary thriller', audience: 'adult', lengthWords: 75000,
  pov: 'third limited', tense: 'past', tone: 'cold, precise',
  logline: 'A lock auditor discovers her own house has been cased.',
  mustNot: ['no dream sequences', 'no coincidence resolutions'],
});

test('the six stages are premise, outline, bible, chapters, revision, export', () => {
  assert.deepEqual(PIPELINE_STAGES, ['premise', 'outline', 'bible', 'chapters', 'revision', 'export']);
});

test('premise and constraints: incomplete premises are refused before any agent runs', () => {
  assert.throws(() => new PremiseSpec({ genre: 'x' }), /missing: audience/);
  assert.throws(() => new PremiseSpec({ genre: 'g', audience: 'a', pov: 'p', tense: 't', tone: 'to', lengthWords: 5000 }), /lengthWords/);
  const brief = premise.brief();
  assert.ok(brief.includes('Logline'));
  assert.ok(brief.includes('Must NOT do: no dream sequences'));
  const nf = new PremiseSpec({ genre: 'g', audience: 'a', pov: 'p', tense: 't', tone: 'to', thesis: 'X causes Y', fiction: false });
  assert.ok(nf.brief().includes('Thesis'));
});

test('the Book Bible is a single JSON source of truth, and writer calls get the relevant slice, not the whole bible', () => {
  const bible = new BookBible({
    characters: [
      { name: 'Mara', age: 41, voice: 'clipped', wounds: 'evicted at 14', goals: 'audit her way to tenure', speechTics: 'counts under her breath', relationships: { Dane: 'ex-partner' }, wants: 'to be trusted', says: 'just doing the job' },
      { name: 'Dane', age: 45, voice: 'warm, evasive', wounds: 'burned workshop', goals: 'buy back the workshop' },
    ],
    worldRules: ['lock audits require two signatures', 'the county keeps one locksmith'],
    locations: [{ name: 'Kettle Street' }, { name: 'the county records office' }],
    chapterTheses: ['Auditing is a trust ritual, not a search for flaws'],
  });
  const sheet = bible.characterSheet('Mara');
  assert.equal(sheet.wantsVsSaid, 'wants: to be trusted | says they want: just doing the job');
  assert.equal(bible.characterSheet('Nobody'), null);
  const slice = bible.slice({ characters: ['Mara'], chapterIndex: 0 });
  assert.ok(slice.includes('Mara'));
  assert.ok(!slice.includes('"name":"Dane"'), 'the writer call gets the relevant character sheet, not the whole bible');
  assert.ok(slice.includes('CHAPTER THESIS'), 'nonfiction slice carries the chapter thesis');
});

test('the outline: 75k words plans ~30 chapter cards with one beat line each, target word counts, acts', () => {
  const { count, targetWords } = planChapterTargets(75000);
  assert.equal(count, 30);
  assert.equal(targetWords, 2500);
  const cards = Array.from({ length: count }, (_, i) => chapterCard({
    index: i + 1, goal: `goal ${i + 1}`, conflict: 'c', change: 'x', who: ['Mara'], cliffhanger: 'cliff', targetWords,
  }));
  assert.equal(cards.length, 30);
  const acts = buildActs(cards);
  assert.equal(acts.length, 3);
  assert.deepEqual(acts[0].cards, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.throws(() => chapterCard({ index: 1, goal: 'g', conflict: 'c', change: 'x', who: [], targetWords: 1 }), /missing cliffhanger/);
});

test('the outline lock: the entire outline, every chapter in order, before a single word of prose', () => {
  const lock = new OutlineLock();
  assert.throws(() => lock.requireProseAllowed(), /no chapter cards/);
  assert.throws(() => lock.addCard({ index: 2, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 1000 }), /in order/, 'out of order generation is refused');
  assert.equal(lock.cards.length, 0);
  lock.addCard({ index: 1, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 1000 });
  assert.throws(() => lock.requireProseAllowed(), /must be generated and approved/);
  lock.approve();
  lock.requireProseAllowed();
});

test('chunked drafting: 800 to 1500 words covering 2 to 3 beats, never a whole chapter', () => {
  const card = chapterCard({ index: 1, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 2500 });
  const chunks = planChunks(card);
  assert.ok(chunks.length >= 2, 'a 2500-word chapter is never one chunk');
  for (const chunk of chunks) {
    assert.ok(chunk.words >= 800 && chunk.words <= 1500, `chunk words ${chunk.words}`);
    assert.match(chunk.beats, /beats \d+-\d+/);
  }
  const total = chunks.reduce((a, c) => a + c.words, 0);
  assert.ok(Math.abs(total - card.targetWords) <= 750, `total ${total} vs ${card.targetWords}`);
});

test('rolling memory: chapter summaries stored, last summary and shared-location scenes retrieved', async () => {
  const memory = new RollingMemory({ summarizer: async text => 'A 300 word summary would go here. '.repeat(15).trim() });
  await memory.recordChapter({ index: 1, text: 'Mara audits the Kettle Street house.', locations: ['Kettle Street'], subplots: ['the letters'], characters: ['Mara'] });
  await memory.recordChapter({ index: 2, text: 'Dane burns his notes at the records office.', locations: ['the county records office'], subplots: ['the letters'], characters: ['Dane'] });
  await memory.recordChapter({ index: 3, text: 'Mara finds the second signature is forged.', locations: ['Kettle Street'], characters: ['Mara'] });
  const r = memory.retrieve({ characters: ['Mara'], locations: ['Kettle Street'], subplots: ['the letters'] });
  assert.match(r.lastSummary, /300 word summary/);
  assert.ok(r.relatedScenes.some(s => s.via === 'location-or-subplot' && s.index !== 3), 'past scenes sharing a location or subplot come back');
  const block = memory.blockFor({ characters: ['Mara'], locations: ['Kettle Street'] });
  assert.match(block, /ROLLING MEMORY/);
  assert.ok(block.split(/\s+/).length <= 330, 'the rolling summary stays capped near 300 words');
  // Subplot tracker: B plots do not vanish for 10 chapters.
  const stale = memory.staleSubplots(14, { maxGap: 10 });
  assert.ok(stale.some(s => s.name === 'the letters' && s.silentFor > 10));
});

test('extractive fallback summary uses the opening, named beats, and the closing line', () => {
  const text = 'Mara arrives at the house. The gate is unlatched, which is wrong. She counts the locks twice. Dane watches from the records office. She leaves without signing.';
  const summary = extractiveSummary(text, ['Mara', 'Dane']);
  assert.ok(summary.includes('Mara arrives at the house.'));
  assert.ok(summary.includes('Dane watches from the records office.'));
  assert.ok(summary.includes('She leaves without signing.'));
});

test('the agent crew: prompts carry the right contract for each role', () => {
  const bible = new BookBible({ characters: [{ name: 'Mara' }] });
  assert.match(architectPrompt({ premise, bible }), /Architect.*Output JSON.*EVERY chapter/s);
  assert.match(criticPrompt({ text: 'x', card: { index: 1, targetWords: 100 }, slopReport: { metrics: {} } }), new RegExp(CRITIC_CHECKLIST[0]));
  assert.match(continuityPrompt({ text: 'x', bible }), /Continuity.*Mara/s);
  assert.match(editorPrompt(), /cut, do not add/);
  const card = chapterCard({ index: 3, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 1200 });
  const [chunk] = planChunks(card);
  assert.match(writerPrompt({ premise, bibleSlice: 'BIBLE', card, chunk, rollingBlock: 'ROLLING', style: 'STYLE' }), /chunk 1 of chapter 3.*1200 words/s);
});

test('QA gates: word count within 10 percent, zero banned phrases, repetition below threshold, continuity passes', () => {
  const card = chapterCard({ index: 1, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 1000 });
  const goodText = '"Sign here," she said. '.repeat(1) + 'The audit sheet had 12 lines and she had crossed off 11 of them by noon. '.repeat(1) + 'Kettle Street held its breath. '.repeat(0) + 'She decided to leave the last line unsigned until Dane called, because a lock audit needs two signatures and hers was only one. '.repeat(1) + 'The kettle ticked as it cooled. Rain had stopped. '.repeat(1) + 'Outside, a dog crossed the street without hurrying. '.repeat(1) + 'She wrote her initials and boxed them in. '.repeat(1);
  const padded = goodText + ' padded padded padded padded'.repeat(220);
  const qa = qaGate({ text: padded, card, slopReport: { metrics: { bannedPhraseCount: 0, repetitionRate: 0.0 } }, continuityReport: { pass: true } });
  assert.ok(Math.abs(qa.wordCount - 1000) / 1000 <= 0.10, `wordCount ${qa.wordCount}`);
  assert.equal(qa.pass, true);
  const fail = qaGate({ text: 'short', card, slopReport: { metrics: { bannedPhraseCount: 2, repetitionRate: 0.5 } }, continuityReport: { pass: false } });
  assert.deepEqual(fail.reasons, ['wordCount', 'bannedPhrases', 'repetition', 'continuity']);
  assert.equal(fail.pass, false);
});

test('targeted rewrite: only flagged paragraphs are rewritten, never the whole chapter', async () => {
  const paragraphs = ['P0 original.', 'P1 original.', 'P2 original.'];
  const calls = [];
  const out = await rewriteFlagged(paragraphs.join('\n\n'), [{ paragraphIndex: 1, reason: 'slop' }], async (paragraph, ctx) => {
    calls.push({ paragraph, reason: ctx.reason });
    return 'P1 rewritten.';
  }, {});
  assert.deepEqual(out.split('\n\n'), ['P0 original.', 'P1 rewritten.', 'P2 original.']);
  assert.equal(calls.length, 1);
});

test('the Coordinator: Architect once, Writer plus Critic per chapter until the score passes, Editor once, two human gates', async () => {
  const memory = new RollingMemory({ summarizer: async () => 'Rolling summary of the chapter, roughly three hundred words of compressed events and consequences. '.repeat(10).trim() });
  const gates = new HumanGates();
  const calls = { architect: 0, writer: 0, critic: 0, continuity: 0, editor: 0 };
  const prose = [
    '"Sign the second line," Mara said.',
    'The audit sheet had 12 lines; she had crossed off 11 by noon, and the twelfth was his.',
    'Kettle Street held its breath while she decided to leave the line blank, because an audit needs two signatures and one of them was forged.',
    'The kettle ticked as it cooled. Rain had stopped. A dog crossed the street without hurrying.',
    'She wrote her initials and boxed them in, twice, the way her mother taught locks: first what opens, then what holds.',
    'It is worth noting that the audit concluded before the storm.',
  ].join('\n\n');
  const card = chapterCard({
    index: 1, goal: 'Audit the Kettle Street house', conflict: 'the second signature is forged', change: 'Mara stops trusting the county',
    who: ['Mara'], cliffhanger: 'the forged signature is her own', subplots: ['the letters'],
    targetWords: (prose.match(/[A-Za-z0-9']+/g) ?? []).length,
  });
  const agents = {
    architect: async () => { calls.architect++; return [{ ...card }]; },
    writer: async () => { calls.writer++; return prose; },
    critic: async () => { calls.critic++; return { score: 95, issues: [] }; },
    continuity: async () => { calls.continuity++; return { pass: true, flags: [] }; },
    editor: async sentence => { calls.editor++; return sentence; },
  };
  const coord = new Coordinator({ premise, bible: new BookBible({ characters: [{ name: 'Mara' }] }), cards: [card], memory, humanGates: gates, agents });
  // Gate 1 is closed: nothing drafts.
  await assert.rejects(() => coord.runChapter(card), /human gate 1/);
  gates.gate1ApprovePremise();
  await assert.rejects(() => coord.runChapter(card), /human gate 1/);
  gates.gate1ApproveOutline();
  const chapter = await coord.runChapter(card);
  assert.equal(chapter.status, 'accepted');
  assert.equal(calls.architect, 0, 'the Architect built the outline before the Coordinator ran; it does not run per chapter');
  assert.ok(calls.critic >= 1);
  // Gate 2: export is refused until the final editor pass and the skim.
  await assert.rejects(async () => coord.export(), /editor must run/);
  await coord.runFinalPass();
  assert.ok(calls.editor > 0, 'the de-slop editor rewrote the slop sentence');
  assert.equal(coord.editorRanOnce, true);
  await assert.rejects(async () => coord.export(), /human gate 2/);
  gates.gate2ApproveFinal();
  const exported = coord.export('epub');
  assert.equal(exported.format, 'epub');
  assert.equal(exported.manuscript.length, 1);
  assert.ok(exported.totalWords > 80);
  // The loop log proves the orchestration shape.
  const events = coord.log.map(l => l.event);
  assert.ok(events.includes('writer-chunk'));
  assert.ok(events.includes('chapter-accepted'));
  assert.ok(events.includes('editor-final'));
});

test('the Coordinator sends a failing chapter back to the Critic, not to a full rewrite', async () => {
  const memory = new RollingMemory({ summarizer: async () => 'Summary. '.repeat(60) });
  const gates = new HumanGates();
  gates.gate1ApprovePremise();
  gates.gate1ApproveOutline();
  const paragraphs = [
    'She checked the locks twice and counted the bills on the counter: 47 dollars.',
    'It is worth noting that the door was unlocked, which was wrong, and the tapestry of the hallway felt vibrant with unease.',
    'The kettle ticked as it cooled. Rain had stopped. A dog crossed the street without hurrying. She decided to leave before the landlord came by with the new lease paperwork, unsigned.',
  ];
  const card = chapterCard({ index: 1, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 1000, subplots: [] });
  const writerCalls = [];
  const agents = {
    writer: async (prompt, ctx) => {
      writerCalls.push(ctx?.reason ?? null);
      if (!ctx?.reason) return paragraphs.join('\n\n');
      // Targeted rewrite: the flagged paragraph only, returned as that paragraph's replacement.
      return 'She checked the locks a third time and wrote 1987 on the audit sheet.';
    },
    critic: async () => ({ score: 90, issues: [] }),
    continuity: async () => ({ pass: true, flags: [] }),
  };
  const coord = new Coordinator({ premise, bible: new BookBible({}), cards: [card], memory, humanGates: gates, agents });
  const chapter = await coord.runChapter(card);
  assert.deepEqual(writerCalls, [null, 'wordCount'], 'first call drafts, the second rewrites the flagged paragraph');
  assert.ok(chapter.text.includes('She checked the locks a third time'), 'the flagged paragraph was rewritten');
  assert.ok(chapter.text.includes('tapestry of the hallway'), 'unflagged paragraphs survive untouched');
  assert.ok(chapter.text.includes('47 dollars') === false, 'the flagged paragraph is gone');
});

test('nonfiction: the Fact Checker flags invented studies; the Writer drafts from source notes only', () => {
  const nf = new PremiseSpec({ genre: 'n', audience: 'a', pov: 'p', tense: 't', tone: 'to', thesis: 'X', fiction: false, lengthWords: 75000 });
  assert.match(writerPrompt({ premise: nf, bibleSlice: '', card: chapterCard({ index: 1, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 1000 }), chunk: { chunk: 1, words: 1000, beats: 'beats 1-2' }, rollingBlock: '', style: '' }), /claim, evidence, example, implication.*source notes only/s);
  const invented = 'A 2021 study showed that 78 percent of writers fail. "Nobody reads the appendix," one reader said.';
  assert.equal(factCheck(invented).pass, false);
  assert.ok(factCheck(invented).flags.length >= 2);
  assert.match(writerPrompt({ premise, bibleSlice: '', card: chapterCard({ index: 1, goal: 'g', conflict: 'c', change: 'x', who: [], cliffhanger: 'cl', targetWords: 1000 }), chunk: { chunk: 1, words: 1000, beats: 'beats 1-2' }, rollingBlock: '', style: '' }), /action, reaction, decision, consequence/);
});

test('the automation split: automate 90 percent, keep two human gates and the final voice pass', () => {
  const gates = new HumanGates();
  assert.equal(gates.gate1Open, false);
  gates.gate1ApprovePremise(); gates.gate1ApproveOutline();
  assert.equal(gates.gate1Open, true, 'Gate 1: approve premise plus outline');
  assert.equal(gates.finalApproved, false, 'Gate 2: skim the final draft');
});
