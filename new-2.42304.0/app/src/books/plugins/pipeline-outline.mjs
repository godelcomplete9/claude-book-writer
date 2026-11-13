// Pipeline structure: premise, Book Bible, layered outline, chunked drafting.
// Work hierarchically: premise -> synopsis -> beat sheet -> chapter outline ->
// scene beats -> prose. The outline is the highest leverage part: every later
// call follows it. The rule that matters most: generate the ENTIRE outline,
// every chapter in order, before drafting a single word of prose. If the
// model invents plot as it goes, it repeats itself by chapter 8.

// Six stages: premise, outline, bible, sequential chapter generation,
// revision, export.
export const PIPELINE_STAGES = ['premise', 'outline', 'bible', 'chapters', 'revision', 'export'];

// Stage 1: premise and constraints. Fed into every later agent.
export class PremiseSpec {
  constructor({
    genre, audience, lengthWords = 75000, pov, tense, tone,
    logline, thesis, mustNot = [], fiction = true,
  }) {
    this.genre = genre; this.audience = audience; this.lengthWords = lengthWords;
    this.pov = pov; this.tense = tense; this.tone = tone;
    this.logline = logline; this.thesis = thesis;
    this.mustNot = mustNot; this.fiction = fiction;
    this.validate();
  }
  validate() {
    const missing = [];
    for (const key of ['genre', 'audience', 'pov', 'tense', 'tone']) if (!this[key]) missing.push(key);
    if (this.fiction && !this.logline) missing.push('logline');
    if (!this.fiction && !this.thesis) missing.push('thesis');
    if (this.lengthWords < 10000) missing.push('lengthWords');
    if (missing.length) throw new Error(`premise incomplete, missing: ${missing.join(', ')}`);
  }
  brief() {
    return [
      `Genre: ${this.genre}`, `Audience: ${this.audience}`, `Length: ~${this.lengthWords} words`,
      `POV: ${this.pov}`, `Tense: ${this.tense}`, `Tone: ${this.tone}`,
      this.fiction ? `Logline: ${this.logline}` : `Thesis: ${this.thesis}`,
      this.mustNot.length ? `Must NOT do: ${this.mustNot.join('; ')}` : '',
    ].filter(Boolean).join('\n');
  }
}

// Stage 2: the Book Bible — a single JSON object that is the source of truth.
// Every writer call gets the relevant slice, not the whole bible.
export class BookBible {
  constructor({ characters = [], worldRules = [], timeline = [], locations = [],
    keyTerms = [], chapterTheses = [], sources = [] } = {}) {
    this.characters = characters; // { name, age, voice, wounds, goals, speechTics, relationships, wants, says }
    this.worldRules = worldRules;
    this.timeline = timeline;
    this.locations = locations;
    this.keyTerms = keyTerms;
    this.chapterTheses = chapterTheses; // nonfiction
    this.sources = sources;             // nonfiction: writer drafts from source notes only
  }
  characterSheet(name) {
    const c = this.characters.find(c => c.name === name);
    if (!c) return null;
    return {
      name: c.name, age: c.age, voice: c.voice, wounds: c.wounds, goals: c.goals,
      speechTics: c.speechTics, relationships: c.relationships,
      wantsVsSaid: c.wants && c.says ? `wants: ${c.wants} | says they want: ${c.says}` : undefined,
    };
  }
  // The relevant slice for a writer call: named characters, locations that
  // appear, world rules that bind, and the chapter thesis for nonfiction.
  slice({ characters = [], locations = [], chapterIndex = null } = {}) {
    const sheets = characters.map(n => this.characterSheet(n)).filter(Boolean);
    const parts = [];
    if (sheets.length) parts.push(`CHARACTER SHEETS:\n${sheets.map(s => JSON.stringify(s)).join('\n')}`);
    const locs = this.locations.filter(l => locations.includes(l.name));
    if (locs.length) parts.push(`LOCATIONS:\n${locs.map(l => JSON.stringify(l)).join('\n')}`);
    if (this.worldRules.length) parts.push(`WORLD RULES:\n- ${this.worldRules.join('\n- ')}`);
    if (this.keyTerms.length) parts.push(`KEY TERMS: ${this.keyTerms.join(', ')}`);
    if (!this.fiction && chapterIndex !== null && this.chapterTheses[chapterIndex]) {
      parts.push(`CHAPTER THESIS: ${this.chapterTheses[chapterIndex]}`);
    }
    return parts.join('\n\n');
  }
}

// Stage 3: the outline in layers. For a 75k novel: act structure, then 25 to
// 40 chapter cards. Each card: goal, conflict, what changes, who appears,
// cliffhanger, target word count.
export function planChapterTargets(totalWords = 75000, { min = 25, max = 40 } = {}) {
  const count = Math.max(min, Math.min(max, Math.round(totalWords / 2500)));
  const targetWords = Math.round(totalWords / count);
  return { count, targetWords };
}

export function chapterCard({ index, goal, conflict, change, who, cliffhanger, targetWords }) {
  for (const [key, value] of Object.entries({ index, goal, conflict, change, who, cliffhanger, targetWords })) {
    if (value === undefined) throw new Error(`chapter card ${index}: missing ${key}`);
  }
  return { index, goal, conflict, change, who, cliffhanger, targetWords, status: 'outlined' };
}

export function buildActs(cards, { acts = 3 } = {}) {
  const per = Math.ceil(cards.length / acts);
  return Array.from({ length: acts }, (_, a) => ({
    act: a + 1, cards: cards.slice(a * per, (a + 1) * per).map(c => c.index),
  })).filter(a => a.cards.length);
}

// Stage 4: chunked drafting. Never ask for a whole chapter at once: chunks of
// 800 to 1500 words covering 2 to 3 beats, plus the rolling summary.
export function planChunks(card, { min = 800, max = 1500, beatsPerChunk = [2, 3] } = {}) {
  const chunks = [];
  let words = card.targetWords, index = 1, beatCursor = 0;
  while (words > 0) {
    let size = Math.min(max, Math.max(min, words));
    if (words - size > 0 && words - size < min) size = Math.max(min, words - Math.ceil(min / 2));
    const beats = beatsPerChunk[index % beatsPerChunk.length];
    chunks.push({ chunk: index, words: size, beats: `beats ${beatCursor + 1}-${beatCursor + beats}` });
    beatCursor += beats;
    words -= size;
    index++;
  }
  return chunks;
}

// The outline lock: prose drafting is refused until every chapter card exists
// (generated in order) and the outline is approved (Gate 1).
export class OutlineLock {
  constructor(cards = []) {
    this.cards = [...cards];
    this.approved = false;
  }
  addCard(card) {
    if (this.cards.length && card.index !== this.cards.length + 1) {
      throw new Error(`outline must be generated in order: expected chapter ${this.cards.length + 1}, got ${card.index}`);
    }
    if (card.index !== this.cards.length + 1) {
      throw new Error(`outline must be generated in order: expected chapter 1, got ${card.index}`);
    }
    this.cards.push(chapterCard(card));
  }
  approve() {
    if (!this.cards.length) throw new Error('cannot approve an empty outline');
    this.approved = true;
  }
  requireProseAllowed() {
    if (!this.cards.length) throw new Error('outline lock: no chapter cards exist yet');
    if (!this.approved) throw new Error('outline lock: the entire outline must be generated and approved before drafting a single word of prose');
  }
}
