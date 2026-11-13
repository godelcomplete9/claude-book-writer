// Rolling memory: after each chapter, auto-summarize it to 250 to 400 words
// and store it in a vector store. The next chapter retrieves: the last
// chapter summary, the relevant character sheets, and any past scene that
// mentions the same location or subplot. This prevents the classic AI
// failure of forgetting names, killing a character twice, or resetting the
// timeline. A subplot tracker keeps B plots from vanishing for 10 chapters.

import { embed, dot } from '../../jev/oscillator-bank.mjs';

const words = text => text.toLowerCase().match(/[a-z']+/g) ?? [];

// Extractive fallback when no summarizer model is injected.
export function extractiveSummary(text, characterNames = []) {
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const named = sentences.filter(s => characterNames.some(n => s.includes(n)));
  const picked = [...new Set([...sentences.slice(0, 2), ...named.slice(0, 3), sentences.at(-1)])];
  return picked.join(' ');
}

export class RollingMemory {
  constructor({ summarizer = null, summaryRange = [250, 400], rollingWords = 300, embedFn = embed } = {}) {
    this.summarizer = summarizer;       // async text => summary
    this.summaryRange = summaryRange;
    this.rollingWords = rollingWords;
    this.embedFn = embedFn;
    this.chapters = [];                 // { id, index, summary, vector, locations, subplots, characters }
    this.subplots = new Map();          // name -> { firstChapter, lastChapter }
  }

  // Called after each chapter is accepted.
  async recordChapter({ index, text, locations = [], subplots = [], characters = [] }) {
    let summary = this.summarizer
      ? await this.summarizer(text, { index })
      : extractiveSummary(text, characters);
    const wc = words(summary).length;
    const inRange = wc >= this.summaryRange[0] && wc <= this.summaryRange[1];
    const entry = {
      id: `ch-${index}`, index, text, summary, summaryWordCount: wc, inRange,
      locations, subplots, characters,
      vector: this.embedFn(`${summary} ${locations.join(' ')} ${subplots.join(' ')}`),
    };
    this.chapters.push(entry);
    for (const s of subplots) {
      const existing = this.subplots.get(s);
      this.subplots.set(s, { firstChapter: existing?.firstChapter ?? index, lastChapter: index });
    }
    return entry;
  }

  // Retrieval for the next chapter: last summary, character sheets, and any
  // past scene sharing a location or subplot (never the last chapter itself —
  // that one is already in the rolling summary).
  retrieve({ characters = [], locations = [], subplots = [], queryText = '', topK = 3 } = {}) {
    const last = this.chapters.at(-1) ?? null;
    const related = [];
    for (const ch of this.chapters.slice(0, -1)) {
      const overlap = ch.locations.some(l => locations.includes(l)) || ch.subplots.some(s => subplots.includes(s));
      if (overlap) related.push({ id: ch.id, index: ch.index, summary: ch.summary, via: 'location-or-subplot' });
    }
    if (queryText && this.chapters.length > 1) {
      const qv = this.embedFn(queryText);
      const bySim = this.chapters.slice(0, -1)
        .map(ch => ({ ch, sim: dot(qv, ch.vector) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, topK);
      for (const { ch, sim } of bySim) {
        if (!related.some(r => r.id === ch.id) && sim > 0.1) {
          related.push({ id: ch.id, index: ch.index, summary: ch.summary, via: `vector-similarity:${sim.toFixed(2)}` });
        }
      }
    }
    return { lastSummary: last?.summary ?? null, relatedScenes: related };
  }

  // Subplot tracker: B plots that have gone silent for too long.
  staleSubplots(currentChapter, { maxGap = 10 } = {}) {
    const stale = [];
    for (const [name, { lastChapter }] of this.subplots) {
      if (currentChapter - lastChapter > maxGap) stale.push({ name, silentFor: currentChapter - lastChapter });
    }
    return stale;
  }

  // The block appended to the next chapter's Strip: the rolling summary of
  // what just happened (capped at ~300 words) plus related past scenes.
  blockFor({ locations = [], subplots = [], characters = [], queryText = '' } = {}) {
    const { lastSummary, relatedScenes } = this.retrieve({ characters, locations, subplots, queryText });
    const parts = [];
    if (lastSummary) {
      const w = lastSummary.split(/\s+/);
      parts.push(`ROLLING MEMORY (what just happened):\n${w.slice(0, this.rollingWords).join(' ')}`);
    }
    if (relatedScenes.length) {
      parts.push(`RELATED PAST SCENES:\n${relatedScenes.map(r => `- ch${r.index} (${r.via}): ${r.summary.split(/\s+/).slice(0, 60).join(' ')}`).join('\n')}`);
    }
    return parts.join('\n\n') || null;
  }
}
