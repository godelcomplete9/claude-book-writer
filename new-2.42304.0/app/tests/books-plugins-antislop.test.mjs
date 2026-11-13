// Acceptance proofs for the antislop plugin measures.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANNED_VOCABULARY, punctuationDiscipline, concretenessCheck, sentenceLengthStats,
  ngramRepetitionRate, detectSlop, generationControls, styleSheet, deslopEdit,
  factCheck, endingPattern, flagEndingPattern,
} from '../src/books/plugins/antislop.mjs';
import { craftPipelineSkills, BOOK_PLUGIN_MANIFEST } from '../src/books/book-skills.mjs';
import { styleCheck } from '../src/books/book-revision.mjs';

test('banned vocabulary and structures are the published lists', () => {
  for (const w of ['delve', 'tapestry', 'realm', 'journey', 'unlock', 'vibrant', 'nestled']) assert.ok(BANNED_VOCABULARY.includes(w), w);
  const rep = detectSlop('She began to delve into the tapestry of her realm, and it is worth noting that the journey unlocked a vibrant new landscape. In conclusion, empowerment is unprecedented.', { fiction: true });
  const types = new Set(rep.issues.map(i => i.type));
  assert.ok(types.has('banned-vocabulary'));
  assert.ok(types.has('banned-structure'));
  assert.equal(rep.pass, false);
});

test('punctuation discipline: em-dash density above 1 per 500 words is flagged', () => {
  const sentences = [];
  for (let i = 0; i < 75; i++) sentences.push('He left. ', 'She stayed. ', 'The door closed. ');
  sentences.push('He looked back — once. ');
  const oneDash = sentences.join('');
  assert.equal(punctuationDiscipline(oneDash).pass, true);
  const fiveDash = ('A — B — C — D — E. ' + 'He left. ').repeat(10);
  const rep = punctuationDiscipline(fiveDash);
  assert.ok(rep.emDashPer500 > 1);
  assert.ok(rep.violations.some(v => v.type === 'em-dash-density'));
});

test('no three sentences in a row starting with the same word', () => {
  const bad = 'She ran. She hid. She waited. Then the knock came.';
  const rep = punctuationDiscipline(bad);
  assert.ok(rep.violations.some(v => v.type === 'same-start-run'));
  const good = 'She ran. The stairs held. Nobody followed her down into the dark.';
  assert.equal(punctuationDiscipline(good).pass, true);
});

test('concreteness rule: pure abstraction is refused, concrete markers accepted', () => {
  const abstract = 'There was a deep complexity to her emotional landscape, a sense of meaning that transcended ordinary understanding of self.';
  assert.equal(concretenessCheck(abstract).concrete, false);
  const concrete = 'She checked the locks twice, then counted the change in her coat pocket: 4 dollars, 60 cents.';
  const c = concretenessCheck(concrete);
  assert.equal(c.concrete, true);
  assert.ok(c.markers.includes('number'));
});

test('sentence length variance: three consecutive same-length sentences and 4-to-30 mixing are measurable', () => {
  const flat = 'He ran fast today. He ran far today. He ran long today.';
  const stats = sentenceLengthStats(flat);
  assert.equal(stats.threeSameRun, true);
  assert.ok(stats.spread < 4);
  const mixed = 'Run. The alley behind the cannery was flooded with three days of rain, and every path she knew was under water, so she climbed the fire escape instead — wet rungs, burning shoulders, no time to think about why.';
  assert.equal(sentenceLengthStats(mixed).threeSameRun, false);
  assert.ok(sentenceLengthStats(mixed).spread >= 15);
});

test('detectSlop returns the metric set the Critic scores against', () => {
  const text = [
    '"Get out," she said, and meant the kitchen, not the house.',
    'The kettle had been screaming for a full minute before anyone touched it.',
    'She counted the bills on the counter: 47 dollars, and the rent was due Friday.',
    'Rain worked its way through the vent above the stove and spotted the floor.',
    'He decided to leave before she saw the letter tucked under the sugar tin.',
    'Outside, a dog barked twice and quit, embarrassed by its own noise.',
    'The coat rack still held his father\'s jacket, stiff with old smoke.',
    'At 6 p.m. the streetlights buzzed on all at once, like a decision made upstairs.',
    '"You count money like it\'s an apology," he told her, pulling on his boots.',
    'She wrote the number 3 on the back of her hand and did not explain it.',
  ].join(' ');
  const rep = detectSlop(text, { fiction: true });
  assert.equal(rep.pass, true, JSON.stringify(rep.issues));
  assert.ok(rep.metrics.dialogueRatio > 0);
  assert.ok('ending' in rep.metrics);
});

test('overused crutch words are counted, not guessed', () => {
  const varied = [
    'The door was unlocked, which was wrong.',
    'She noticed it from the stairs.',
    'The kettle sat cold on the burner.',
    'Someone had moved the mail.',
  ].join(' ');
  const text = 'Suddenly the phone rang. It seemed to ring forever. She realized who it was. Suddenly it stopped. Suddenly again, no. Suddenly a third time. ' + varied;
  const rep = detectSlop(text, { fiction: true });
  assert.ok(Object.keys(rep.metrics.overused).includes('suddenly'));
  assert.ok(rep.metrics.overused.suddenly >= 4);
  // The detection returns issues for the crutch words but the count, not a vibe, is the verdict.
  assert.ok(rep.issues.some(i => i.type === 'overused-words'));
});

test('chapter ending pattern: three rhetorical-question endings in a row are flagged', () => {
  const q = 'He walked home. Did he even know her at all?';
  const l = 'He walked home. He learned that trust is earned.';
  const plain = 'He walked home and ate dinner at the counter without speaking.';
  assert.equal(endingPattern(q), 'rhetorical-question');
  assert.equal(endingPattern(l), 'lesson');
  assert.equal(endingPattern(plain), null);
  assert.equal(flagEndingPattern([q, q, q].map(endingPattern)), true);
  assert.equal(flagEndingPattern([q, l, plain].map(endingPattern)), false);
});

test('de-slop editor: cut, do not add — throat clearing and transitions are removed', async () => {
  const text = 'It is worth noting that the mine had closed in 1987. She checked the locks twice. '
    + 'That said, moving on. '
    + 'She felt a deep sense of unease as she navigated the complex tapestry of her emotions. '
    + 'She counted the bills: 47 dollars.';
  const result = await deslopEdit(text);
  assert.ok(!result.text.includes('It is worth noting'));
  assert.ok(!result.text.includes('That said, moving on'));
  assert.ok(result.text.includes('She checked the locks twice'));
  assert.ok(result.text.includes('47 dollars'));
  assert.ok(result.cuts.length >= 2);
  // Semantic rewrite of an abstract sentence goes to the per-paragraph editor call only.
  const edited = await deslopEdit(text, () => 'She checked the locks a third time.');
  assert.ok(edited.text.includes('She checked the locks a third time.'));
  assert.ok(!edited.text.includes('complex tapestry'));
});

test('generation controls: fiction runs hot, nonfiction runs cool', () => {
  const fiction = generationControls('fiction');
  const nonfiction = generationControls('nonfiction');
  assert.deepEqual(fiction.temperature, [0.7, 0.9]);
  assert.deepEqual(nonfiction.temperature, [0.3, 0.5]);
  assert.deepEqual(fiction.frequencyPenalty, [0.3, 0.6]);
});

test('style sheet: voice DNA plus the banned lists, ready to paste into a writer prompt', () => {
  const sheet = styleSheet({ voiceDna: 'Short sentences. Names the tools.', alwaysWords: ['kettle'], neverWords: ['dichotomy'] });
  assert.ok(sheet.includes('VOICE DNA'));
  assert.ok(sheet.includes('WORDS I NEVER USE: dichotomy'));
  assert.ok(sheet.includes('delve'));
  assert.ok(sheet.includes('1 em dash per 500 words'));
});

test('nonfiction fact pass: statistics, quotes and dates without a source are flagged', () => {
  const unsourced = 'A 2023 study found that 62 percent of readers quit. "It was over," one editor said.';
  const flagged = factCheck(unsourced);
  assert.equal(flagged.pass, false);
  assert.ok(flagged.flags.some(f => f.type === 'statistic'));
  assert.ok(flagged.flags.some(f => f.type === 'quote'));
  const sourced = 'A 2023 study (Martinez et al) found that 62 percent of readers quit, according to the report.';
  assert.equal(factCheck(sourced).pass, true);
});

test('pipeline plugin skills are valid Mini Skills with real enforcement', () => {
  const skills = craftPipelineSkills({ fiction: true });
  const ids = skills.map(s => s.id);
  for (const expected of ['concreteness', 'banned-vocabulary', 'punctuation-discipline', 'sentence-variance', 'rolling-memory', 'continuity', 'scene-structure', 'de-slop']) {
    assert.ok(ids.includes(expected), expected);
  }
  for (const s of skills) {
    assert.ok(s.embedding && s.embedding.length === 64, s.id);
    assert.ok(s.evaluationCheck, s.id);
    assert.ok(s.trigger, s.id);
  }
  // Nonfiction swaps scene-structure for claim-structure + fact-check.
  const nf = craftPipelineSkills({ fiction: false });
  const nfIds = nf.map(s => s.id);
  assert.ok(!nfIds.includes('scene-structure'));
  assert.ok(nfIds.includes('claim-structure') && nfIds.includes('fact-check'));
  // bannedPhrases flow through the existing styleCheck enforcement.
  const banned = skills.find(s => s.id === 'banned-vocabulary');
  const checks = styleCheck('She began to delve into the tapestry.', [banned]);
  assert.equal(checks.pass, false);
  assert.ok(checks.problems.some(p => p.type === 'banned-phrase'));
});

test('plugin constraints are enforced by styleCheck per beat', () => {
  const skills = craftPipelineSkills({ fiction: true });
  const punct = skills.find(s => s.id === 'punctuation-discipline');
  const variance = skills.find(s => s.id === 'sentence-variance');
  const concreteness = skills.find(s => s.id === 'concreteness');
  const dashHeavy = 'She ran — fast — through — the hall — outside. '.repeat(20);
  assert.ok(styleCheck(dashHeavy, [punct]).problems.some(p => p.detail.includes('em-dash')));
  const flat = 'He ran. He ran. He ran.';
  assert.ok(styleCheck(flat, [variance]).problems.some(p => p.detail.includes('same length')));
  const abstract = 'There was a profound sense of meaning that transcended the ordinary understanding of everything she had ever believed about herself.';
  assert.ok(styleCheck(abstract, [concreteness]).problems.some(p => p.detail.includes('abstraction')));
  assert.equal(styleCheck('She checked the locks twice.', [punct, variance, concreteness]).pass, true);
});

test('the plugin manifest describes what the book writer can switch on', () => {
  assert.equal(BOOK_PLUGIN_MANIFEST.length, 4);
  for (const p of BOOK_PLUGIN_MANIFEST) assert.ok(p.id && p.name && p.desc && p.provides.length, p.id);
});
