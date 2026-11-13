// Antislop plugin: prevention, generation controls, detection, de-slop edit.
// Slop is not just bad words — it is emptiness: with no information to fill,
// the model pads with ornate diction and parallelism. These checks run after
// every chapter; a failing chapter goes back to the Critic, not to a rewrite.

// Banned vocabulary: emptiness markers, not style disagreements.
export const BANNED_VOCABULARY = [
  'delve', 'tapestry', 'landscape', 'realm', 'journey', 'unlock', 'empower',
  'embrace', 'navigate', 'unpack', 'vibrant', 'nestled', 'cutting edge',
  'game changer', 'unprecedented', 'elevate',
];

// Banned structures: filler shapes that survive any vocabulary swap.
export const BANNED_STRUCTURES = [
  { id: 'worth-noting', re: /\bit(?:'?s| is)? worth noting\b/i },
  { id: 'in-conclusion', re: /\bin conclusion\b/i },
  { id: 'fast-paced-world', re: /\bin today'?s fast[\s-]paced world\b/i },
  { id: 'not-only-but-also', re: /\bnot only\b[^.!?]*\bbut also\b/i },
  { id: 'not-x-but-y', re: /\bit is not\b[^.!?]*\b[,;]\s*it is\b/i },
  // Rule of three: a 3-item list that IS the sentence (short list shapes like
  // "brave, kind, and true."), not any sentence with two commas and an "and".
  { id: 'rule-of-three', listCheck: true },
];

function isRuleOfThree(sentence) {
  const w = (sentence.match(/[A-Za-z0-9']+/g) ?? []).length;
  return w <= 12 && /\b\w[\w'-]*,\s*\w[\w'-]*,\s*and\s+\w[\w'-]*\b[.!?]?$/.test(sentence.trim());
}

// Overused crutch words, counted per chapter.
export const OVERUSED_WORDS = ['suddenly', 'realized', 'felt', 'seemed', 'as if'];

const splitSentences = text => text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
const splitParagraphs = text => text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const words = text => text.toLowerCase().match(/[a-z']+/g) ?? [];

// Punctuation discipline: em dashes <= 1 per 500 words, limited rhetorical
// questions, no three sentences in a row starting with the same word.
export function punctuationDiscipline(text, { maxEmDashPer500 = 1, maxRhetoricalQuestions = 3 } = {}) {
  const sentences = splitSentences(text);
  const count = words(text).length || 1;
  const emDashCount = (text.match(/—|\s--\s/g) ?? []).length;
  const emDashPer500 = (emDashCount / count) * 500;
  const rhetorical = sentences.filter(s => /\?$/.test(s) && /^(what|why|how|did|do|does|is|was|could|would|who)\b/i.test(s)).length;
  let sameStartRun = 0, run = 1, worstRun = 1, runWord = '', worstWord = '';
  for (const s of sentences) {
    const first = (words(s)[0] ?? '');
    if (first === runWord) { run++; if (run > worstRun) { worstRun = run; worstWord = first; } }
    else { run = 1; runWord = first; }
  }
  sameStartRun = worstRun;
  const violations = [];
  if (emDashPer500 > maxEmDashPer500) violations.push({ type: 'em-dash-density', detail: `${emDashPer500.toFixed(2)} per 500 words > ${maxEmDashPer500}` });
  if (rhetorical > maxRhetoricalQuestions) violations.push({ type: 'rhetorical-questions', detail: `${rhetorical} > ${maxRhetoricalQuestions}` });
  if (sameStartRun >= 3) violations.push({ type: 'same-start-run', detail: `${sameStartRun} sentences starting with "${worstWord}"` });
  return { emDashPer500, rhetorical, sameStartRun, violations, pass: violations.length === 0 };
}

// Concreteness rule: every paragraph must contain a specific noun, number,
// sensory detail, decision, or piece of dialogue. No pure abstraction.
export function concretenessCheck(paragraph) {
  const markers = [];
  if (/\d/.test(paragraph)) markers.push('number');
  if (/"[^"]+"|“[^”]+”/.test(paragraph)) markers.push('dialogue');
  if (/\b(smell|scent|taste|texture|warm|cold|stiff|grit|salt|burnt|damp|sharp|rough)\b/i.test(paragraph)) markers.push('sensory');
  if (/\b(decided|refused|chose|grabbed|slammed|signed|locked|quit|walked out|hung up)\b/i.test(paragraph)) markers.push('decision');
  if ((words(paragraph).length >= 4) && /\b(her|his|their) (hands|eyes|mouth|back|coat|keys|coffee|phone|desk)\b/i.test(paragraph)) markers.push('specific-noun');
  return { concrete: markers.length > 0, markers };
}

// Sentence length variance: no three consecutive sentences of the same
// length; mix 4-word sentences with 30-word ones. A measurable AI tell.
export function sentenceLengthStats(text) {
  const lengths = splitSentences(text).map(s => (s.match(/[A-Za-z0-9']+/g) ?? []).length);
  let threeSameRun = false, run = 1;
  for (let i = 1; i < lengths.length; i++) {
    run = lengths[i] === lengths[i - 1] ? run + 1 : 1;
    if (run >= 3) { threeSameRun = true; break; }
  }
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length : 0;
  return { lengths, threeSameRun, spread: lengths.length ? Math.max(...lengths) - Math.min(...lengths) : 0, variance };
}

// N-gram repetition rate: repeated 4-grams over the chapter.
export function ngramRepetitionRate(text) {
  const w = words(text);
  const grams = new Map();
  let total = 0;
  for (let i = 0; i + 4 <= w.length; i++) {
    const g = w.slice(i, i + 4).join(' ');
    grams.set(g, (grams.get(g) ?? 0) + 1);
    total++;
  }
  let repeated = 0;
  for (const n of grams.values()) if (n > 1) repeated += n - 1;
  return total ? repeated / total : 0;
}

function dialogueRatio(text) {
  const w = words(text).length || 1;
  const quoted = (text.match(/"[^"]+"|“[^”]+”/g) ?? []).join(' ');
  return (words(quoted).length / w);
}

function citationRatio(text) {
  const paragraphs = splitParagraphs(text).length || 1;
  const citations = (text.match(/\(\d{4}\)|\bet al\b|https?:\/\/|\[\d+\]|\bsource:/gi) ?? []).length;
  return citations / paragraphs;
}

// Chapter ending pattern: 3 chapters in a row ending with a rhetorical
// question or a moralizing lesson must be flagged.
export function endingPattern(text) {
  const lastSentence = splitSentences(text).at(-1) ?? '';
  const lastParagraph = splitParagraphs(text).at(-1) ?? '';
  if (/\?$/.test(lastSentence)) return 'rhetorical-question';
  if (/\b(lesson|learned|teaches|that'?s (why|how)|realized that|understood that)\b/i.test(lastParagraph)) return 'lesson';
  return null;
}

export function flagEndingPattern(history) {
  const last3 = history.filter(Boolean).slice(-3);
  return last3.length === 3 && last3.every(e => e === 'rhetorical-question' || e === 'lesson');
}

// The detection script: run after each chapter. A failing chapter returns to
// the Critic with the issue list — never to a full rewrite.
export function detectSlop(chapterText, {
  fiction = true, endingHistory = [], bannedVocabulary = BANNED_VOCABULARY,
  maxRepetitionRate = 0.02, maxEmDashPer500 = 1,
} = {}) {
  const issues = [];
  const lower = chapterText.toLowerCase();
  // Word-boundary match: "unlocked" is not "unlock".
  const bannedHit = p => new RegExp(`\\b${p.replace(/[-\s]/g, '\\s+')}\\b`, 'i').test(chapterText);
  const bannedPhraseCount = bannedVocabulary.filter(bannedHit).length;
  if (bannedPhraseCount > 0) issues.push({ type: 'banned-vocabulary', detail: bannedVocabulary.filter(bannedHit) });
  for (const b of BANNED_STRUCTURES) {
    const hit = b.listCheck
      ? splitSentences(chapterText).some(isRuleOfThree)
      : b.re.test(chapterText);
    if (hit) issues.push({ type: 'banned-structure', detail: b.id });
  }
  const rep = ngramRepetitionRate(chapterText);
  if (rep > maxRepetitionRate) issues.push({ type: 'n-gram-repetition', detail: rep.toFixed(3) });
  const punct = punctuationDiscipline(chapterText, { maxEmDashPer500 });
  issues.push(...punct.violations);
  const sl = sentenceLengthStats(chapterText);
  if (sl.threeSameRun) issues.push({ type: 'same-length-run', detail: 'three consecutive sentences of the same length' });
  if (sl.spread < 8) issues.push({ type: 'flat-length-spread', detail: `spread=${sl.spread}` });
  const abstractionOnly = splitParagraphs(chapterText).filter(p => !concretenessCheck(p).concrete && (words(p).length > 15));
  if (abstractionOnly.length) issues.push({ type: 'abstraction-only-paragraph', detail: abstractionOnly.length });
  const overused = {};
  for (const w of OVERUSED_WORDS) {
    const n = (lower.match(new RegExp(`\\b${w}\\b`, 'g')) ?? []).length;
    if (n > 0) overused[w] = n;
  }
  if (Object.keys(overused).some(w => overused[w] >= 4)) issues.push({ type: 'overused-words', detail: overused });
  const dialogue = dialogueRatio(chapterText);
  const citation = citationRatio(chapterText);
  if (fiction && dialogue === 0 && words(chapterText).length > 200) issues.push({ type: 'zero-dialogue', detail: 'fiction chapter with no dialogue' });
  if (!fiction && citation === 0 && words(chapterText).length > 200) issues.push({ type: 'zero-citations', detail: 'nonfiction chapter with no sources' });
  const currentEnding = endingPattern(chapterText);
  if (flagEndingPattern([...endingHistory, currentEnding])) issues.push({ type: 'ending-pattern', detail: `three chapters in a row end with a ${currentEnding}` });
  return {
    pass: issues.length === 0, issues, metrics: {
      bannedPhraseCount, repetitionRate: rep, emDashPer500: punct.emDashPer500,
      rhetoricalQuestions: punct.rhetorical, sentenceLengthVariance: sl.variance,
      sentenceSpread: sl.spread, dialogueRatio: dialogue, citationRatio: citation,
      overused, ending: currentEnding,
    },
  };
}

// Generation controls: temperature and penalties per mode.
export function generationControls(mode = 'fiction') {
  if (mode === 'fiction') return { temperature: [0.7, 0.9], frequencyPenalty: [0.3, 0.6], presencePenalty: [0.2, 0.4] };
  return { temperature: [0.3, 0.5], frequencyPenalty: [0.3, 0.6], presencePenalty: [0.2, 0.4] };
}

// Voice DNA: human sample text plus words you use and words you never use.
// More powerful than a banned list alone; this is the Writer's style sheet.
export function styleSheet({ voiceDna = '', alwaysWords = [], neverWords = [] } = {}) {
  const lines = [];
  if (voiceDna) lines.push(`VOICE DNA (match this, do not summarize it):\n${voiceDna}`);
  if (alwaysWords.length) lines.push(`WORDS I USE: ${alwaysWords.join(', ')}`);
  if (neverWords.length) lines.push(`WORDS I NEVER USE: ${neverWords.join(', ')}`);
  lines.push(`BANNED VOCABULARY: ${BANNED_VOCABULARY.join(', ')}`);
  lines.push('BANNED STRUCTURES: "it is worth noting", "in conclusion", "in today\'s fast paced world", "not only X but also Y", "it is not X, it is Y", rule-of-three lists, moralizing final paragraphs.');
  lines.push('PUNCTUATION: at most 1 em dash per 500 words; limited rhetorical questions; never three sentences in a row starting with the same word.');
  lines.push('LENGTH: vary sentence length on purpose — mix 4-word sentences with 30-word ones; never three consecutive sentences of the same length.');
  lines.push('CONCRETENESS: every paragraph must contain a specific noun, number, sensory detail, decision, or dialogue. No paragraph of pure abstraction.');
  return lines.join('\n');
}

const THROAT_CLEARING = /^(it(?:'?s| is)? worth noting|in conclusion|in today'?s fast[\s-]paced world|as (we|you) (can )?see|needless to say|it goes without saying|firstly|lastly|overall|in summary)\b[,.]?\s*/i;

// The de-slop editor: one job — cut, do not add. Deterministic pass, per
// sentence: cut throat-clearing openers (keeping the information after them),
// drop pure-transition sentences, and send flagged sentences that need a
// semantic rewrite to the injected editor call. Never a whole-chapter rewrite.
export async function deslopEdit(text, editorCall = null) {
  const cuts = [];
  const keptParagraphs = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const kept = [];
    for (const rawSentence of paragraph.split(/(?<=[.!?])\s+/)) {
      let sentence = rawSentence.trim();
      if (!sentence) continue;
      const wasSlop = editorCall ? needsRewrite(sentence) : false;
      const opener = sentence.match(THROAT_CLEARING);
      if (opener) {
        cuts.push({ cut: opener[0].trim() });
        sentence = sentence.slice(opener[0].length).trim();
        if (!sentence) continue;
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
      }
      const isTransitionOnly = !concretenessCheck(sentence).concrete
        && !/"[^"]+"/.test(sentence)
        && (words(sentence).length <= 18)
        && /\b(that said|as mentioned|moving on|in other words|to sum up|with that)\b/i.test(sentence);
      if (isTransitionOnly) { cuts.push({ cut: sentence }); continue; }
      if (editorCall && wasSlop) {
        sentence = (await editorCall(sentence)).trim();
      }
      kept.push(sentence);
    }
    if (kept.length) keptParagraphs.push(kept.join(' '));
  }
  return { text: keptParagraphs.join('\n\n'), cuts, pass: keptParagraphs.length > 0 };
}

function needsRewrite(sentence) {
  return BANNED_VOCABULARY.some(v => sentence.toLowerCase().includes(v))
    || BANNED_STRUCTURES.some(b => (b.listCheck ? isRuleOfThree(sentence) : b.re.test(sentence)));
}

// Nonfiction fact pass: flag any statistic, quote, or date without a source
// marker in the same sentence. This is where most AI books fail.
export function factCheck(text) {
  const flags = [];
  for (const sentence of splitSentences(text)) {
    const sourced = /\(\s*\d{4}\s*\)|\bet al\b|https?:\/\/|\[\d+\]|\baccording to\b|\bsource:|\bper the\b|\breported by\b/i.test(sentence);
    const claims = [];
    if (/\b\d+(\.\d+)?\s?(%|percent)\b/i.test(sentence)) claims.push('statistic');
    if (/\b(19|20)\d{2}\b/.test(sentence)) claims.push('date');
    if (/("[^"]{10,}")|(“[^”]{10,}”)/.test(sentence)) claims.push('quote');
    if (/\bstudy|studies|research|survey|report\b/i.test(sentence)) claims.push('study-claim');
    for (const c of claims) if (!sourced) flags.push({ type: c, sentence: sentence.slice(0, 120) });
  }
  return { pass: flags.length === 0, flags };
}
