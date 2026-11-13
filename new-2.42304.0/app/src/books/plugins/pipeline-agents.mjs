// Multi-agent pipeline: Architect, Writer, Critic, Continuity, Editor,
// coordinated so that Architect runs once, Writer plus Critic run per chapter
// until the score passes the threshold, and the Editor runs once at the end.
// True minimal intervention uses only two human gates: approve premise plus
// outline (Gate 1), skim the final draft (Gate 2). Everything in between
// auto-approves if it passes the QA gates.

import { detectSlop, styleSheet, deslopEdit, factCheck, generationControls, BANNED_VOCABULARY } from './antislop.mjs';
import { planChunks } from './pipeline-outline.mjs';

export const AGENT_ROLES = ['architect', 'writer', 'critic', 'continuity', 'editor'];

export function architectPrompt({ premise, bible }) {
  return [
    'You are the Architect. Build the bible and the outline, then lock the plot.',
    'Output JSON: chapter cards with goal, conflict, change, who, cliffhanger, targetWords.',
    'Generate EVERY chapter before any prose exists.',
    premise.brief(),
    bible.characters.length ? `Characters: ${bible.characters.map(c => c.name).join(', ')}` : '',
    !premise.fiction ? 'Build the outline from the sources; the Writer will draft from source notes only.' : '',
  ].filter(Boolean).join('\n');
}

export function writerPrompt({ premise, bibleSlice, card, chunk, rollingBlock, style }) {
  return [
    `You are the Writer. Draft ONLY chunk ${chunk.chunk} of chapter ${card.index}: about ${chunk.words} words covering ${chunk.beats}.`,
    `Never write past the chunk. Do not resolve the cliffhanger "${card.cliffhanger}" before its chapter.`,
    premise.fiction
      ? 'Scene structure: action, reaction, decision, consequence.'
      : 'Structure: claim, evidence, example, implication. Draft from source notes only; never invent a study.',
    bibleSlice, rollingBlock, style,
  ].filter(Boolean).join('\n\n');
}

export const CRITIC_CHECKLIST = [
  'word count within 10 percent of target',
  'zero banned phrases',
  'repetition score below threshold',
  'continuity check passes',
  'concreteness: no paragraph of pure abstraction',
  'sentence length variance present',
];

export function criticPrompt({ text, card, slopReport }) {
  return [
    'You are the Critic. Score against the checklist; flag slop and logic gaps. Do not rewrite.',
    `Checklist: ${CRITIC_CHECKLIST.join('; ')}.`,
    `Chapter ${card.index} (target ${card.targetWords} words).`,
    `Detection report: ${JSON.stringify(slopReport.metrics)}`,
    'Return JSON: { score, issues: [{ paragraphIndex, reason }] }.',
    text,
  ].join('\n');
}

export function continuityPrompt({ text, bible }) {
  return [
    'You are the Continuity agent. Check names, dates and facts against the bible.',
    `Known characters: ${bible.characters.map(c => c.name).join(', ') || 'none'}.`,
    'Flag any unknown recurring name, any date that breaks the timeline, any dead character acting again.',
    text,
  ].join('\n');
}

export function editorPrompt() {
  return [
    'You are the de-slop Editor. One job: cut, do not add.',
    'Cut every transition sentence that adds no information. Prefer short over long.',
    'Replace abstract adjectives with concrete nouns. Delete throat-clearing openers.',
    'Rewrite only the flagged paragraphs, never the whole chapter.',
    `Banned: ${BANNED_VOCABULARY.join(', ')}.`,
  ].join('\n');
}

// QA gates: word count within 10 percent, zero banned phrases, repetition
// score below threshold, continuity check passes -> auto-approve.
export function qaGate({ text, card, slopReport, continuityReport, tolerance = 0.10, maxRepetitionRate = 0.02 } = {}) {
  const wc = (text.match(/[A-Za-z0-9']+/g) ?? []).length;
  const checks = {
    wordCount: Math.abs(wc - card.targetWords) / card.targetWords <= tolerance,
    bannedPhrases: slopReport.metrics.bannedPhraseCount === 0,
    repetition: slopReport.metrics.repetitionRate <= maxRepetitionRate,
    continuity: continuityReport.pass,
  };
  const reasons = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return { pass: reasons.length === 0, wordCount: wc, checks, reasons };
}

// The two human gates. Everything between them auto-approves on QA pass.
export class HumanGates {
  constructor() {
    this.premiseApproved = false;
    this.outlineApproved = false;
    this.finalApproved = false;
  }
  gate1ApprovePremise() { this.premiseApproved = true; }
  gate1ApproveOutline() { this.outlineApproved = true; }
  get gate1Open() { return this.premiseApproved && this.outlineApproved; }
  gate2ApproveFinal() { this.finalApproved = true; }
}

// Targeted rewrite: split into paragraphs, replace ONLY the flagged ones.
export async function rewriteFlagged(text, issues, writer, context) {
  const paragraphs = text.split(/\n\s*\n/);
  const flagged = new Set(issues.map(i => i.paragraphIndex));
  for (const i of flagged) {
    if (paragraphs[i] === undefined) continue;
    paragraphs[i] = await writer(paragraphs[i], { ...context, reason: issues.find(x => x.paragraphIndex === i).reason });
  }
  return paragraphs.join('\n\n');
}

// The Coordinator: Architect runs once, Writer plus Critic run per chapter
// until the score passes the threshold, Editor runs once at the end.
export class Coordinator {
  constructor({
    premise, bible, cards, memory, humanGates,
    agents, // { architect, writer, critic, continuity, editor } async fns
    controls = generationControls(premise.fiction ? 'fiction' : 'nonfiction'),
    style = styleSheet(),
    criticThreshold = 80, maxRevisionLoops = 2,
  }) {
    this.premise = premise; this.bible = bible; this.cards = cards;
    this.memory = memory; this.humanGates = humanGates; this.agents = agents;
    this.controls = controls; this.style = style;
    this.criticThreshold = criticThreshold; this.maxRevisionLoops = maxRevisionLoops;
    this.chapters = []; this.log = [];
    this.editorRanOnce = false;
  }
  record(event, detail = null) { this.log.push({ event, detail }); }

  async runChapter(card) {
    if (!this.humanGates.gate1Open) throw new Error('human gate 1: premise and outline must be approved before any chapter is drafted');
    const chunks = planChunks(card);
    let text = '';
    for (const chunk of chunks) {
      const bibleSlice = this.bible.slice({ characters: card.who, locations: [], chapterIndex: card.index - 1 });
      const rollingBlock = this.memory.blockFor({ characters: card.who, queryText: card.goal }) ?? '';
      const prompt = writerPrompt({ premise: this.premise, bibleSlice, card, chunk, rollingBlock, style: this.style });
      const piece = await this.agents.writer(prompt, { card, chunk });
      text = text ? `${text}\n\n${piece}` : piece;
      this.record('writer-chunk', { chapter: card.index, chunk: chunk.chunk, words: chunk.words });
    }
    // Writer plus Critic per chapter until the score passes the threshold.
    let slopReport = detectSlop(text, { fiction: this.premise.fiction, endingHistory: this.chapters.map(c => c.slopReport?.metrics?.ending) });
    let critic = await this.agents.critic(criticPrompt({ text, card, slopReport }), { text, card, slopReport });
    let loops = 0;
    while (critic.score < this.criticThreshold && loops < this.maxRevisionLoops) {
      this.record('critic-fail', { chapter: card.index, score: critic.score, issues: critic.issues.length });
      // Targeted rewrite: flagged paragraphs only, never a whole-chapter rewrite.
      text = await rewriteFlagged(text, critic.issues, this.agents.writer, { card });
      slopReport = detectSlop(text, { fiction: this.premise.fiction, endingHistory: this.chapters.map(c => c.slopReport?.metrics?.ending) });
      critic = await this.agents.critic(criticPrompt({ text, card, slopReport }), { text, card, slopReport });
      loops++;
    }
    // QA gates: auto-approve if they pass; else back to the Critic's issue list.
    const continuityReport = await this.agents.continuity(continuityPrompt({ text, bible: this.bible }), { text });
    const qa = qaGate({ text, card, slopReport, continuityReport });
    if (!qa.pass) {
      this.record('qa-fail', { chapter: card.index, reasons: qa.reasons });
      text = await rewriteFlagged(text, qa.reasons.map(r => ({ paragraphIndex: 0, reason: r })), this.agents.writer, { card });
      slopReport = detectSlop(text, { fiction: this.premise.fiction, endingHistory: this.chapters.map(c => c.slopReport?.metrics?.ending) });
    }
    // Nonfiction fact pass before the chapter is stored.
    const facts = this.premise.fiction ? { pass: true, flags: [] } : factCheck(text);
    if (!facts.pass) this.record('fact-flags', { chapter: card.index, flags: facts.flags.length });
    const chapter = { card, text, slopReport, critic, qa, facts, loops, status: qa.pass && facts.pass ? 'accepted' : 'flagged' };
    this.chapters.push(chapter);
    await this.memory.recordChapter({
      index: card.index, text,
      locations: [], subplots: card.subplots ?? [], characters: card.who,
    });
    this.record('chapter-accepted', { chapter: card.index, status: chapter.status, score: critic.score });
    return chapter;
  }

  // Final passes: the de-slop editor runs once at the end (cut, do not add).
  async runFinalPass() {
    if (!this.chapters.length) throw new Error('no chapters to edit');
    let edits = 0;
    for (const chapter of this.chapters) {
      const before = chapter.text;
      const result = await deslopEdit(before, this.agents.editor ?? null);
      if (result.text !== before) { chapter.text = result.text; edits++; }
      chapter.deslopCuts = result.cuts.length;
    }
    this.record('editor-final', { chaptersTouched: edits });
    this.editorRanOnce = true;
    return { edits };
  }

  // Export: Gate 2 (skim the final draft) then format to EPUB or DOCX.
  export(format = 'epub') {
    if (!this.editorRanOnce) throw new Error('the editor must run before export');
    if (!this.humanGates.finalApproved) throw new Error('human gate 2: skim the final draft before export');
    const manuscript = this.chapters.map(c => ({ chapter: c.card.index, title: c.card.goal, words: (c.text.match(/\S+/g) ?? []).length, text: c.text }));
    return { format, manuscript, totalWords: manuscript.reduce((a, c) => a + c.words, 0) };
  }
}
