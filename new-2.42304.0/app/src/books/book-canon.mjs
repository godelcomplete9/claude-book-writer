// CanonStore: perfect recall, non-decaying, injected every time.
// Canon is NEVER leaky. Facts never decay; they only change state with a
// versioned edit. LeakyMemory is separate and never the sole home of a fact.

export const CANON_CATEGORIES = ['character', 'world', 'timeline', 'relationship', 'object', 'event', 'name', 'rule'];
export const CANON_STATUS = ['active', 'dead', 'changed'];

let fid = 0;
const nid = () => `fact-${(++fid).toString(36)}`;

export class CanonStore {
  constructor(bookId) {
    this.id = nid();
    this.bookId = bookId;
    this.facts = [];
    this.edits = [];   // versioned edit history, never decays
    this.tick = 0;
  }

  addFact({ text, category, sourceSceneId = null, status = 'active' }) {
    if (!CANON_CATEGORIES.includes(category)) throw new Error(`bad canon category ${category}`);
    const fact = {
      id: nid(), text, category, status,
      sourceSceneId, createdTick: this.tick, version: 1,
    };
    this.facts.push(fact);
    return fact;
  }

  // Versioned edit with reason. Edits do not decay; history is retained.
  editFact(factId, { text = null, status = null, reason }) {
    const fact = this.facts.find(f => f.id === factId);
    if (!fact) throw new Error(`unknown canon fact ${factId}`);
    if (status && !CANON_STATUS.includes(status)) throw new Error(`bad canon status ${status}`);
    this.edits.push({ factId, tick: this.tick, reason, before: { text: fact.text, status: fact.status } });
    if (text != null) { fact.text = text; fact.version++; }
    if (status != null) fact.status = status;
    return fact;
  }

  // Injection subset for a scene: categories the scene depends on, plus ALL
  // facts with status dead or changed (their contradictions must stay guarded).
  selectForScene(categories) {
    return this.facts.filter(f =>
      categories.includes(f.category) || f.status === 'dead' || f.status === 'changed');
  }

  renderBlock(facts) {
    if (!facts.length) return 'CANON - DO NOT CONTRADICT\n(no canon facts)';
    return 'CANON - DO NOT CONTRADICT\n' + facts.map(f =>
      `- [${f.category}/${f.status}] ${f.text}`).join('\n');
  }

  // CanonCheck: compare draft against CanonStore. Flag any contradiction:
  // wrong name, wrong timeline, resurrected character, broken world rule.
  checkDraft(draft, categories = []) {
    const flags = [];
    const facts = this.selectForScene(categories);
    for (const f of facts) {
      const subject = keySubject(f.text);
      if (!subject) continue;
      const mentioned = draft.toLowerCase().includes(subject);
      if (!mentioned) continue;
      if (f.status === 'dead' && mentionsAlive(draft, subject)) {
        flags.push({ type: 'resurrected-character', factId: f.id, text: f.text });
      }
      if (f.category === 'rule' && violatesWorldRule(draft, f)) {
        flags.push({ type: 'broken-world-rule', factId: f.id, text: f.text });
      }
      if (f.category === 'timeline' && violatesTimeline(draft, f)) {
        flags.push({ type: 'wrong-timeline', factId: f.id, text: f.text });
      }
      if (f.status === 'changed' && contradictsChanged(draft, f)) {
        flags.push({ type: 'contradicts-changed-fact', factId: f.id, text: f.text });
      }
    }
    return { pass: flags.length === 0, flags };
  }
}

// Pull the most likely proper-noun subject out of a canon fact text. Facts
// without a proper noun fall back to their leading word (e.g. "before the
// flood, ..." -> "before").
function keySubject(text) {
  const m = text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?/);
  if (m) return m[0].toLowerCase();
  const lead = text.match(/^(\w+)/);
  return lead ? lead[1].toLowerCase() : null;
}

function mentionsAlive(draft, subject) {
  const re = new RegExp(`${subject}[^.!?]{0,80}`, 'gi');
  for (const m of draft.matchAll(re)) {
    const win = m[0].toLowerCase();
    if (/(walks in|enters|she said|he said|her hand|his hand|she smiled|he smiled|spoke)/.test(win)) return true;
  }
  return false;
}

function violatesWorldRule(draft, fact) {
  // fact.text pattern: "X cannot Y" / "X never Y" — flag if draft shows Y happening.
  const m = fact.text.match(/(\w+)\s+(cannot|never|can't|may not)\s+(\w+)/i);
  if (!m) return false;
  const subject = m[1].toLowerCase(), verb = m[3].toLowerCase();
  const re = new RegExp(`${subject}[^.!?]{0,40}\\b${verb}`, 'i');
  return re.test(draft);
}

function violatesTimeline(draft, fact) {
  // fact.text pattern: "before X, Y" — flag if draft claims Y after X markers.
  const m = fact.text.match(/before\s+([^,]+),\s+(.+)/i);
  if (!m) return false;
  const anchor = m[1].trim().toLowerCase();
  const claim = m[2].trim().toLowerCase();
  const anchorAt = draft.toLowerCase().indexOf(anchor);
  const claimAt = draft.toLowerCase().indexOf(claim);
  return anchorAt >= 0 && claimAt >= 0 && claimAt > anchorAt && claimAt - anchorAt < 200;
}

function contradictsChanged(draft, fact) {
  // If a fact changed to "X is now Y", flag drafts asserting the old form.
  const m = fact.text.match(/is now\s+(.+)/i);
  if (!m) return false;
  const now = m[1].trim().toLowerCase();
  const re = new RegExp(`\\b(?:no longer|not)\\s+${now.split(' ')[0]}`, 'i');
  return re.test(draft);
}
