// Benchmarks: plain pipeline vs hybrid (Structure Layer + Jev Voice Layer).
// Runs both drafters over the same outline with the same stub Main Brain and
// reports: voice variety (sentence-length variance), prose repetition
// (4-gram reuse), continuity errors (canon flags), Jev call count, cost.
//
// Run: node benchmarks/plain-vs-hybrid.mjs > benchmarks/results.json
import { BookStructure } from '../src/books/book-structure.mjs';
import { CanonStore } from '../src/books/book-canon.mjs';
import { LeakyMemory } from '../src/books/book-leaky-memory.mjs';
import { BookDraftEngine } from '../src/books/book-draft-engine.mjs';
import { JevLatticeHarness } from '../src/jev/jev-lattice-harness.mjs';

const SENT_OPEN = [
  'The corridor kept its cold.', 'He said nothing.', 'Rain stitched the window.',
  'The kettle screamed itself silent.', 'She folded the letter twice.',
];
const SENT_LONG = [
  'and the whole argument came back to her at once, every clause of it, arranged like stones across a ford she had crossed too quickly the first time.',
  'while the city outside went on assembling its ordinary evening, one lit window at a time, indifferent to the arithmetic of debts it had never agreed to keep.',
  'because the letter had been written in the voice she trusted most, and that was precisely why she could not answer it without lying about something she had promised never to lie about.',
];

function stubMainBrain(strip) {
  // honour the anti-slop bans in the strip: none of the pool uses banned phrases
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const longs = Math.random() < 0.5 ? 1 : 2;
  const parts = [pick(SENT_OPEN)];
  for (let i = 0; i < longs; i++) parts.push(pick(SENT_LONG));
  if (Math.random() < 0.5) parts.push(pick(SENT_OPEN));
  return parts.join(' ');
}

function freshBook() {
  const structure = new BookStructure({ title: 'Bench', genre: 'literary',
    premise: 'A clockmaker loses her sister and gains a debt.',
    guidingWords: ['debt', 'gears', 'mourning'] });
  structure.buildOutline({ acts: 2, chaptersPerAct: 2, scenesPerChapter: 3, characters: ['Ilse'] });
  structure.approveOutline();
  structure.approveSceneList();
  const canon = new CanonStore(structure.id);
  canon.addFact({ text: 'Ilse died in chapter 2', category: 'event', status: 'dead' });
  canon.addFact({ text: 'Marek cannot swim', category: 'rule' });
  const memory = new LeakyMemory({ alpha: 0.95 });
  const harness = new JevLatticeHarness({ oscillatorCount: 400, leakyMemory: memory });
  return { structure, canon, memory, harness };
}

function sentenceStats(text) {
  const s = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lengths = s.map(x => x.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, lengths.length);
  const words = text.toLowerCase().split(/\s+/);
  const grams = new Map();
  for (let i = 0; i + 4 <= words.length; i++) {
    const g = words.slice(i, i + 4).join(' ');
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  const repeated = [...grams.values()].filter(n => n > 1).length;
  return { sentences: s.length, meanLength: +mean.toFixed(2), variance: +variance.toFixed(2), repeatedGrams: repeated };
}

function run(hybrid, beats) {
  const { structure, canon, memory, harness } = freshBook();
  let jevCalls = 0, llmCalls = 0, canonFlags = 0, accepted = 0;
  let corpus = '';
  const engine = new BookDraftEngine({
    structure, canon, leakyMemory: memory, harness,
    mainBrain: strip => { llmCalls++; return stubMainBrain(strip); },
    hybrid,
  });
  for (let i = 0; i < beats; i++) {
    try {
      const r = engine.draftBeat({ userInput: i % 3 === 0 ? 'keep the pressure on the debt' : null, forceDraft: true });
      if (r.accepted) { accepted++; corpus += ' ' + r.draft; }
      if (r.revisionId) canonFlags++;
    } catch { /* structure exhausted */ break; }
  }
  engine.processRevisions();
  return {
    mode: hybrid ? 'hybrid' : 'plain',
    beatsAttempted: beats,
    beatsAccepted: accepted,
    jevCalls: hybrid ? harness.jev.log.length : 0,   // one per beat, never per sentence
    llmCalls,
    canonFlags,
    ...sentenceStats(corpus),
  };
}

const beats = Number(process.env.BENCH_BEATS ?? 40);
const hybrid = run(true, beats);
const plain = run(false, beats);
const result = { date: new Date().toISOString(), beats, plain, hybrid,
  note: 'Jev calls scale with beats (one per beat), never with sentences. Voice variety = sentence-length variance; repetition = repeated 4-grams; continuity = beats sent to revision for canon/style.' };
console.log(JSON.stringify(result, null, 2));
