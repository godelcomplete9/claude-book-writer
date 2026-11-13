// BookDraftEngine: the hybrid draft loop for one book.
//
// Architecture split:
//   Structure Layer (BookStructure): traditional, perfect recall. Owns
//     outline, acts, scenes, arcs, pacing, canon selection.
//   Voice and Texture Layer (JevLatticeHarness + Mini Skills): leaky and
//     noisy. Per beat, picks voice, emotion, rhythm, image, tension skills
//     and builds the Strip.
//   Main Brain: the Claude clone LLM. Writes prose inside the Strip. It does
//     not decide.
//   CanonStore: perfect recall, injected every time.
//   LeakyMemory: decaying psychology only.
//
// Toggle OFF restores plain behavior for Books: a plain pipeline with no Jev,
// no oscillator, no voice layer — canon block + scene objective only.

import { CanonStore } from './book-canon.mjs';
import { LeakyMemory } from './book-leaky-memory.mjs';
import { BookStructure } from './book-structure.mjs';
import { BookEditor } from './book-editor.mjs';
import { RevisionQueue, runChecks } from './book-revision.mjs';
import { JevLatticeHarness } from '../jev/jev-lattice-harness.mjs';
import { defaultCalibration } from '../jev/oscillator-bank.mjs';

export class BookDraftEngine {
  constructor({
    structure, canon, leakyMemory, harness, editor, mainBrain,
    hybrid = true, maxRevisionPasses = 2,
    plugins = [], rollingMemory = null, // pipeline plugins: extra Mini Skills + RollingMemory
  }) {
    this.structure = structure;         // BookStructure
    this.canon = canon;                 // CanonStore
    this.leakyMemory = leakyMemory;     // LeakyMemory
    this.harness = harness;             // JevLatticeHarness
    this.editor = editor ?? new BookEditor({ bookId: structure.id });
    this.mainBrain = mainBrain;         // (strip, ctx) => prose text
    this.hybrid = hybrid;               // toggle off -> plain pipeline
    this.plugins = plugins;             // pipeline skill set (craftPipelineSkills output)
    this.rollingMemory = rollingMemory; // RollingMemory (pipeline-memory.mjs)
    if (this.hybrid && this.harness && this.plugins.length) {
      // Plugin skills join the same bank: they gate via Jev like core skills.
      const known = new Set(this.harness.skills.map(s => s.id));
      this.harness.skills.push(...this.plugins.filter(s => !known.has(s.id)));
    }
    this.revisionQueue = new RevisionQueue({ maxPasses: maxRevisionPasses });
    this.jevCalls = 0;                  // proof log: one call per beat
    this.beatLog = [];
    this.rewards = [];
  }

  // Draft one beat of the next pending scene. Returns the beat record.
  draftBeat({ userInput = null, forceDraft = false } = {}) {
    const scene = this.structure.getNextScene();
    if (!scene) throw new Error('no pending scene: structure exhausted');
    if (!this.structure.approvals.sceneList) {
      throw new Error('outline and scene list must be approved before drafting');
    }
    // Structure Layer hands down: objective + canon subset + beat goal.
    const beatIndex = scene.beats.length;
    const beatGoal = scene.beats[beatIndex - 1]?.nextBeatGoal ?? `advance objective: ${scene.objective.slice(0, 60)}`;
    if (scene.beatsPlanned === undefined) scene.beatsPlanned = 4; // 3 to 8 beats per scene
    const canonFacts = this.structure.selectCanonFacts(this.canon, scene.id);
    const canonBlock = this.canon.renderBlock(canonFacts);

    let strip, decision = null;
    // Rolling memory block: the rolling summary of what just happened plus
    // related past scenes, injected into the Strip in both modes.
    const memoryBlock = this.rollingMemory
      ? this.rollingMemory.blockFor({ characters: scene.who ?? [], queryText: `${scene.objective} ${beatGoal}` })
      : null;
    if (this.hybrid) {
      // Voice Layer: ONE Jev call for this beat, then the Strip.
      const result = this.harness.tick({
        sceneObjective: scene.objective,
        beatGoal,
        recentText: this.editor.getChapter(scene.chapterId)?.text?.slice(-400) ?? '',
        canonBlock,
        userInput,
        sceneId: scene.id,
        worldDomain: 8, // D09 Meaning pressure default
        forceDraft,
      });
      decision = result.decision;
      strip = result.strip ?? [
        canonBlock,
        `SCENE OBJECTIVE: ${scene.objective}`,
        `BEAT GOAL: ${beatGoal}`,
      ].join('\n\n');
      this.jevCalls++;
      if (!decision.fire && !forceDraft) {
        // gate stayed low: hold the voice, no draft this tick
        this.beatLog.push({ sceneId: scene.id, beatIndex, fired: false, jevCalls: this.jevCalls });
        return { sceneId: scene.id, beatIndex, fired: false, decision };
      }
    } else {
      // Plain pipeline: no Jev, no oscillator, no voice layer.
      strip = [canonBlock, `SCENE OBJECTIVE: ${scene.objective}`, `BEAT GOAL: ${beatGoal}`].join('\n\n');
    }
    if (memoryBlock) strip = `${strip}\n\n${memoryBlock}`;

    // Main Brain drafts inside the Strip.
    const draft = this.mainBrain(strip, { sceneId: scene.id, beatIndex, decision });

    // Evaluation checks: per-skill evaluationCheck + CanonCheck + StyleCheck.
    // Plugin skills are always enforced (their bannedPhrases/constraints),
    // on top of the active voice circuit in hybrid mode.
    const activeSkills = [
      ...(this.hybrid && this.harness.activeCircuit.length
        ? this.harness.skills.filter(s => this.harness.activeCircuit.includes(s.id))
        : []),
      ...this.plugins,
    ];
    const checks = runChecks(draft, { canon: this.canon, structure: this.structure, activeSkills });

    const beat = { sceneId: scene.id, chapterId: scene.chapterId, beatIndex, draft, checks, strip, decision, hybrid: this.hybrid };

    if (checks.canon.pass && checks.style.pass) {
      // accept beat, append to chapter, update LeakyMemory, update coupling
      this.editor.appendBeat(scene.chapterId, draft, { checks, beatIndex });
      this.harness.settle?.({ draftText: draft, userInput });
      scene.beats.push({ goal: beatGoal, draft });
      if (scene.beats.length >= scene.beatsPlanned) {
        scene.status = 'complete';
        this.structure.completeScene(scene.id);
      }
      this.beatLog.push({ sceneId: scene.id, beatIndex, fired: true, accepted: true, jevCalls: this.jevCalls });
      this.rewards.push({ beatIndex, reward: checks.style.signal ?? 0 });
      return { ...beat, accepted: true };
    }

    // checks failed: revision queue, do not auto-accept
    const item = this.revisionQueue.enqueue({ sceneId: scene.id, beatIndex, text: draft, checks });
    this.beatLog.push({ sceneId: scene.id, beatIndex, fired: true, accepted: false, revisionId: item.id });
    return { ...beat, accepted: false, revisionId: item.id };
  }

  // Revision pass over the queue (max 2 passes per beat, then user review).
  processRevisions() {
    const out = [];
    for (const item of this.revisionQueue.queue) {
      if (item.status === 'queued') {
        this.revisionQueue.revise(item, {
          harness: this.harness, canon: this.canon, structure: this.structure,
          mainBrain: this.mainBrain,
        });
        out.push(item);
      }
    }
    return out;
  }

  // Continue from the last beat with LeakyMemory and I_sim as input, not just
  // the last paragraph.
  continue(userInput = null) {
    return this.draftBeat({ userInput });
  }
}
