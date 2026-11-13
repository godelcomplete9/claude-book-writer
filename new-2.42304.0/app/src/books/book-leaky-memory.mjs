// LeakyMemory: decaying memory for character psychology only — mood, recent
// emotion, recent thought, fatigue, avoidance, last line. It decays as
// alpha^k (default alpha 0.95) and is used for voice variety, never for
// facts. NEVER store a canon fact only in LeakyMemory.

export class LeakyMemory {
  constructor({ alpha = 0.95, character = 'protagonist' } = {}) {
    this.alpha = alpha;
    this.character = character;
    this.entries = [];       // { text, weight, kind, bornTick }
    this.tick = 0;
    this.decayLog = [];      // decay rate logged per tick for tests
  }

  update(text, { weight = 1.0, kind = 'thought' } = {}) {
    if (!text) return;
    // last line echo
    const lastLine = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(-1)[0] ?? text;
    this.entries.push({ text: lastLine.slice(0, 160), weight, kind, bornTick: this.tick });
    if (this.entries.length > 50) this.entries.shift();
  }

  // One decay tick: every entry's effective weight multiplies by alpha^k
  // where k = ticks since born. High-weight wounds persist longer because
  // their weight is large, not because they are exempt.
  decayTick() {
    this.tick++;
    for (const e of this.entries) {
      const k = this.tick - e.bornTick;
      e.effective = e.weight * Math.pow(this.alpha, k);
    }
    this.decayLog.push({ tick: this.tick,
      effective: this.entries.map(e => +(e.effective ?? e.weight).toFixed(4)) });
    // psychologically faded entries drop below a floor
    this.entries = this.entries.filter(e => (e.effective ?? e.weight) >= 0.01);
  }

  stateWeight() {
    if (!this.entries.length) return 0;
    const last = this.entries[this.entries.length - 1];
    return Math.min(1, (last.effective ?? last.weight) * 0.6);
  }

  // Block injected into the Strip. Explicitly psychology-only.
  getBlock() {
    if (!this.entries.length) return '(no psychology state)';
    const top = [...this.entries].sort((a, b) => (b.effective ?? b.weight) - (a.effective ?? a.weight)).slice(0, 3);
    return top.map(e => `- ${(e.effective ?? e.weight).toFixed(2)} ${e.kind}: ${e.text}`).join('\n');
  }

  // Low weight psychology fades after ~20 beats; high weight wound persists.
  snapshot() { return this.entries.map(e => ({ text: e.text, effective: e.effective ?? e.weight, bornTick: e.bornTick })); }
}
