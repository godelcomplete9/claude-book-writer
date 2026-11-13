// BookStructure: the Structure Layer. Class BookStructure.
// Traditional, deterministic, perfect recall. It owns outline, acts, scenes,
// arcs, pacing and canon selection. NO oscillator may change outline, act
// order, scene order, or arc — oscillators only change how a scene is
// written, not what happens in it.
//
// Flow: premise -> outline -> user approves outline -> user approves scene
// list -> only then the Voice Layer drafts.

export const BOOK_STATUS = ['outlining', 'drafting', 'revising'];

let uid = 0;
const nid = p => `${p}-${(++uid).toString(36)}-${(Date.now() % 46656).toString(36)}`;

export class BookStructure {
  constructor({ id, title, genre, premise, authors = [], guidingWords = [], latticeId = null, radius = 4, oscillatorCount = 2000 }) {
    if (guidingWords.length < 3 || guidingWords.length > 7) {
      throw new Error('guidingWords must be 3 to 7 words');
    }
    this.id = id ?? nid('book');
    this.title = title;
    this.genre = genre;
    this.premise = premise;
    this.authors = authors.slice(0, 5);
    this.guidingWords = guidingWords.slice(0, 7);
    this.latticeId = latticeId;
    this.radius = radius;
    this.oscillatorCount = oscillatorCount;
    this.createdAt = Date.now();
    this.status = BOOK_STATUS[0];
    this.acts = [];
    this.chapters = [];
    this.scenes = [];      // flat scene list in strict order
    this.arcs = [];        // character arcs
    this.pacing = { wordsPerScene: 600, tensionCurve: [], actBreaks: [] };
    this.approvals = { outline: false, sceneList: false };
    this.outlineApproved = false;
  }

  // Deterministic outline builder from premise + guiding words. Oscillator
  // calibration can never alter this: it takes no lattice input at all.
  buildOutline({ acts = 3, chaptersPerAct = 2, scenesPerChapter = 3, characters = [], seedText = '' } = {}) {
    this.acts = [];
    this.chapters = [];
    this.scenes = [];
    const goals = ['establish the world and the wound', 'escalate the cost of wanting', 'force the reckoning'];
    for (let a = 0; a < acts; a++) {
      const act = {
        id: `act-${a + 1}`,
        goal: goals[Math.min(a, goals.length - 1)],
        setups: [],
        payoffs: [],
        pacingTarget: a === 0 ? 'slow build' : a === 1 ? 'accelerate' : 'compress to break',
      };
      this.acts.push(act);
      for (let ch = 0; ch < chaptersPerAct; ch++) {
        const chapter = {
          id: `ch-${a + 1}-${ch + 1}`, actId: act.id, index: this.chapters.length + 1,
          title: `Chapter ${this.chapters.length + 1}`,
          tension: 0.3 + 0.7 * (this.chapters.length / Math.max(1, acts * chaptersPerAct - 1)),
        };
        this.chapters.push(chapter);
        for (let sc = 0; sc < scenesPerChapter; sc++) {
          const scene = {
            id: `sc-${chapter.id}-${sc + 1}`,
            chapterId: chapter.id,
            actId: act.id,
            objective: `Act ${a + 1} goal: ${act.goal}. Advance ${this.genre} through ${seedText || this.premise.slice(0, 40)}`,
            characters: characters.slice(0, 3),
            location: 'unset',
            tensionTarget: chapter.tension,
            beats: [],
            status: 'pending',
            canonDependencies: ['character', 'world'],
          };
          this.acts[a].setups.push(scene.id);
          this.scenes.push(scene);
        }
      }
      this.pacing.actBreaks.push(act.id);
    }
    for (const c of characters) {
      this.arcs.push({
        id: nid('arc'), bookId: this.id, character: c,
        startState: `${c} wants, and hides it`, endState: `${c} pays for the want`,
        beatsWhereArcShifts: [], arcCheckPerScene: {},
      });
    }
    this.status = BOOK_STATUS[0];
    return this;
  }

  approveOutline() { this.approvals.outline = true; }
  approveSceneList() {
    if (!this.approvals.outline) throw new Error('approve outline first');
    this.approvals.sceneList = true;
    this.status = BOOK_STATUS[1];
  }

  // Structure Layer API used by the Voice Layer. --------------------------------
  getNextScene() {
    return this.scenes.find(s => s.status === 'pending' || s.status === 'in-progress') ?? null;
  }

  getScene(sceneId) { return this.scenes.find(s => s.id === sceneId) ?? null; }

  getSceneObjective(sceneId) { return this.getScene(sceneId)?.objective ?? null; }

  getActForScene(sceneId) {
    const s = this.getScene(sceneId);
    return s ? this.acts.find(a => a.id === s.actId) ?? null : null;
  }

  // Setup/payoff pairing: setups come from earlier scenes in the same act or
  // previous acts; payoffs point at later scenes that must land them.
  getSetupPayoffForScene(sceneId) {
    const s = this.getScene(sceneId);
    if (!s) return null;
    const idx = this.scenes.indexOf(s);
    const earlier = this.scenes.slice(0, idx).map(x => x.id);
    const later = this.scenes.slice(idx + 1).map(x => x.id);
    return { setupsDue: earlier.slice(-3), payoffsOwed: later.slice(0, 3) };
  }

  setBeats(sceneId, beats) {
    const s = this.getScene(sceneId);
    if (!s) throw new Error(`unknown scene ${sceneId}`);
    if (!this.approvals.sceneList) throw new Error('scene list not approved: Voice Layer may not draft yet');
    if (s.beats.length) throw new Error('beats already set for scene; oscillators may not rewrite structure');
    s.beats = beats; s.status = 'in-progress';
  }

  completeScene(sceneId) {
    const s = this.getScene(sceneId);
    if (s) s.status = 'complete';
  }

  // Continuity: draft text must not contradict canon facts the scene depends
  // on. Canon check itself lives in CanonStore; this wraps it for structure.
  validateContinuity(draft, canon) {
    return canon.checkDraft(draft, this.currentCanonDependencies ?? []);
  }

  // Canon subset selection for a scene: facts whose category matches the
  // scene's canonDependencies, plus ALL facts with status dead or changed.
  selectCanonFacts(canon, sceneId) {
    const s = this.getScene(sceneId);
    const deps = s?.canonDependencies ?? [];
    this.currentCanonDependencies = deps;
    return canon.selectForScene(deps);
  }
}
