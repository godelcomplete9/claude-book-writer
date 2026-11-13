// Revision machinery: evaluation checks, revision queue, revision passes.
// After a draft beat: per-skill evaluationCheck + CanonCheck + StyleCheck.
// If checks fail, the beat goes to the revision queue with a reason (canon,
// style, rhythm, banned phrase). Max 2 revision passes per beat, then flag
// for user review.

import { evaluateDraftSignals } from '../jev/jev-lattice-harness.mjs';

export function styleCheck(text, activeSkills = []) {
  const problems = [];
  const banned = new Set();
  for (const s of activeSkills) for (const p of s.bannedPhrases) banned.add(p);
  for (const p of banned) {
    const re = new RegExp(`\\b${p}\\b`, 'i');
    if (re.test(text)) problems.push({ type: 'banned-phrase', detail: p });
  }
  // constraints: maxAdjectivesPerSentence
  for (const s of activeSkills) {
    const maxAdj = s.constraints?.maxAdjectivesPerSentence;
    if (!maxAdj) continue;
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const adjectives = (sentence.match(/\b(?:very|sudden|dark|cold|bright|heavy|quiet|strange)\b/gi) ?? []).length;
      if (adjectives > maxAdj) {
        problems.push({ type: 'constraint', detail: `too many adjectives (${adjectives} > ${maxAdj})` });
        break;
      }
    }
  }
  // rhythm variety: sentence lengths must not all sit in one band
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lengths = sentences.map(s => s.split(/\s+/).length);
  if (lengths.length >= 3) {
    const spread = Math.max(...lengths) - Math.min(...lengths);
    if (spread < 4) problems.push({ type: 'rhythm', detail: `flat rhythm, spread=${spread}` });
  }
  // repeated phrasing: same 4-gram twice
  const grams = new Map();
  const words = text.toLowerCase().split(/\s+/);
  for (let i = 0; i + 4 <= words.length; i++) {
    const g = words.slice(i, i + 4).join(' ');
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  for (const [g, n] of grams) if (n > 1) { problems.push({ type: 'repeated-phrasing', detail: g }); break; }
  return { pass: problems.length === 0, problems, signal: evaluateDraftSignals(text) };
}

export class RevisionQueue {
  constructor({ maxPasses = 2 } = {}) {
    this.maxPasses = maxPasses;
    this.queue = [];
  }

  enqueue({ sceneId, beatIndex, text, checks }) {
    const reasons = [];
    if (!checks.canon.pass) reasons.push('canon');
    const styleTypes = new Set((checks.style.problems ?? []).map(p => p.type));
    for (const t of styleTypes) reasons.push(t === 'banned-phrase' || t === 'constraint' ? 'style' : t);
    const item = {
      id: `rev-${this.queue.length + 1}`, sceneId, beatIndex, text, checks,
      reasons: [...new Set(reasons)], passes: 0, status: 'queued',
      revisionGoal: makeRevisionGoal(reasons),
    };
    this.queue.push(item);
    return item;
  }

  // One revision pass: run a second Jev call with a revision goal, build a new
  // Strip with revision constraints, Main Brain revises, re-run checks.
  revise(item, { harness, canon, structure, mainBrain }) {
    if (item.passes >= this.maxPasses) {
      item.status = 'user-review';
      return item;
    }
    item.passes++;
    const decision = harness.jev.decide({
      activeSkills: [], tickType: 'beat', beatIndex: harness.beatIndex,
      sceneId: item.sceneId, silenceTickCount: 0, userInput: item.revisionGoal,
    });
    decision.templateId = 'revision';
    const strip = [
      canon?.renderBlock?.(canon.selectForScene([])) ?? 'CANON - DO NOT CONTRADICT',
      `REVISION GOAL: ${item.revisionGoal}`,
      `REASONS: ${item.reasons.join(', ')}`,
      'DRAFT TO REVISE:\n' + item.text,
    ].join('\n\n');
    const revised = mainBrain(strip, { sceneId: item.sceneId, revision: true, decision });
    const checks = runChecks(revised, { canon, structure, activeSkills: [] });
    item.text = revised;
    item.checks = checks;
    item.status = checks.canon.pass && checks.style.pass ? 'accepted' :
      item.passes >= this.maxPasses ? 'user-review' : 'queued';
    return item;
  }
}

function makeRevisionGoal(reasons) {
  if (reasons.includes('canon')) return 'fix canon: align the beat with the Canon Store, no contradictions';
  if (reasons.includes('rhythm')) return 'vary rhythm: break the repeated sentence shapes';
  if (reasons.includes('repeated-phrasing')) return 'vary phrasing: remove the repeated construction';
  return 'make it more withheld: cut explanation, keep pressure';
}

export function runChecks(text, { canon, structure, activeSkills }) {
  const style = styleCheck(text, activeSkills ?? []);
  const canonCheck = canon?.checkDraft
    ? canon.checkDraft(text, structure?.currentCanonDependencies ?? [])
    : { pass: true, flags: [] };
  return { style, canon: canonCheck };
}
