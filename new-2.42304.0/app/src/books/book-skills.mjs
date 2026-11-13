// Pipeline plugin skills: the antislop and pipeline measures packaged as Mini
// Skills the book writer can use. Each skill is a real Mini Skill (same shape
// as craftCoreSkills output): it composes with the oscillator bank, gates via
// Jev lock resonance, and its bannedPhrases/constraints/evaluationCheck are
// enforced by styleCheck and the Critic. Structural measures (human gates,
// outline lock, QA gates, rolling memory) are plugins in plugins/, not
// oscillators: they own process, not voice.

import { DOMAINS, FUNCS, INTERNAL_BANK_HZ, EXTERNAL_BANK_HZ, composeEmbedding } from '../jev/oscillator-bank.mjs';
import { makeMiniSkill, DIM } from '../jev/mini-skills.mjs';
import { BANNED_VOCABULARY } from './plugins/antislop.mjs';

const bankOf = func => (func <= 7 ? INTERNAL_BANK_HZ : EXTERNAL_BANK_HZ);

function pipelineSkill({ id, domain, func, stance, move, purpose, trigger, promptFragment, bannedPhrases = [], constraints = {}, evaluationCheck }) {
  const base = makeMiniSkill({ id, oscillatorId: `osc-${id}`, domain, func, tags: { stance, move, purpose }, hz: bankOf(func)[FUNCS[func]] });
  return {
    ...base,
    trigger,
    promptFragment,
    bannedPhrases,
    constraints,
    evaluationCheck,
    embedding: composeEmbedding(domain, func, { stance, move, purpose }, DIM),
  };
}

// Build the plugin skill set. `fiction: false` swaps the scene-structure
// skill for claim-evidence-example-implication and adds the fact checker.
export function craftPipelineSkills({ fiction = true } = {}) {
  const skills = [
    pipelineSkill({
      id: 'concreteness', domain: 4, func: 7, stance: 'open', move: 'compress', purpose: 'revelation',
      trigger: 'paragraph at risk of pure abstraction',
      promptFragment: 'Every paragraph must contain a specific noun, number, sensory detail, decision, or piece of dialogue. No paragraph of pure abstraction.',
      constraints: { concretenessRequired: true },
      evaluationCheck: 'Does every paragraph contain a specific noun, number, sensory detail, decision, or dialogue?',
    }),
    pipelineSkill({
      id: 'banned-vocabulary', domain: 2, func: 0, stance: 'clinical', move: 'compress', purpose: 'tension',
      trigger: 'emptiness markers in the draft',
      promptFragment: 'These words are emptiness, not style: they pad when there is nothing to say. Never use them.',
      bannedPhrases: BANNED_VOCABULARY,
      evaluationCheck: 'Zero banned vocabulary in the beat?',
    }),
    pipelineSkill({
      id: 'punctuation-discipline', domain: 2, func: 6, stance: 'clinical', move: 'contrast', purpose: 'tension',
      trigger: 'em-dash or same-start rhythm drifting',
      promptFragment: 'At most 1 em dash per 500 words. Limited rhetorical questions. Never three sentences in a row starting with the same word.',
      constraints: { maxEmDashPer500: 1, maxSameStartRun: 2 },
      evaluationCheck: 'Punctuation discipline held: em-dash density, rhetorical questions, repeated sentence starts?',
    }),
    pipelineSkill({
      id: 'sentence-variance', domain: 2, func: 6, stance: 'wry', move: 'expand', purpose: 'relief',
      trigger: 'sentence lengths flattening',
      promptFragment: 'Vary sentence length on purpose: mix 4-word sentences with 30-word ones. Never three consecutive sentences of the same length. This is one of the most measurable AI tells.',
      constraints: { noSameLengthRun: 3 },
      evaluationCheck: 'Do sentence lengths genuinely vary — 4-word against 30-word, no three identical in a row?',
    }),
    pipelineSkill({
      id: 'rolling-memory', domain: 11, func: 13, stance: 'open', move: 'echo', purpose: 'tension',
      trigger: 'entering a new chunk or chapter',
      promptFragment: 'Write against the rolling summary of what just happened and the related past scenes. Never contradict names, dates or wounds already stored.',
      evaluationCheck: 'Is the beat consistent with the rolling summary and related past scenes?',
    }),
    pipelineSkill({
      id: 'de-slop', domain: 2, func: 0, stance: 'clinical', move: 'compress', purpose: 'relief',
      trigger: 'revision pass',
      promptFragment: 'Cut, do not add: cut every transition sentence that adds no information, prefer short over long, replace abstract adjectives with concrete nouns, delete throat-clearing openers.',
      evaluationCheck: 'Did the pass only cut and concretize — nothing padded back in?',
    }),
    pipelineSkill({
      id: 'continuity', domain: 5, func: 10, stance: 'clinical', move: 'pivot', purpose: 'tension',
      trigger: 'names, dates or facts appear',
      promptFragment: 'Every name, date and fact must match the bible. Flag unknown recurring names, timeline breaks, dead characters acting again.',
      evaluationCheck: 'Do all names, dates and facts check against the bible?',
    }),
  ];
  if (fiction) {
    skills.push(pipelineSkill({
      id: 'scene-structure', domain: 5, func: 8, stance: 'open', move: 'pivot', purpose: 'tension',
      trigger: 'scene without a spine',
      promptFragment: 'Force scene structure: action, reaction, decision, consequence. Slop happens when there is no structure to fill.',
      constraints: { sceneStructure: ['action', 'reaction', 'decision', 'consequence'] },
      evaluationCheck: 'Does the beat carry action, reaction, decision, consequence?',
    }));
  } else {
    skills.push(pipelineSkill({
      id: 'claim-structure', domain: 8, func: 8, stance: 'clinical', move: 'expand', purpose: 'revelation',
      trigger: 'nonfiction section without a spine',
      promptFragment: 'Force structure: claim, evidence, example, implication. Slop happens when there is no structure to fill.',
      constraints: { sceneStructure: ['claim', 'evidence', 'example', 'implication'] },
      evaluationCheck: 'Does the beat carry claim, evidence, example, implication?',
    }));
    skills.push(pipelineSkill({
      id: 'fact-check', domain: 5, func: 10, stance: 'clinical', move: 'compress', purpose: 'tension',
      trigger: 'statistic, quote or date appears',
      promptFragment: 'No statistic, quote or date without a source in the same sentence. The model invents studies; do not let it.',
      evaluationCheck: 'Is every statistic, quote and date sourced in its sentence?',
    }));
  }
  return skills;
}

// Plugin manifest for the Books surface: what the writer can switch on.
export const BOOK_PLUGIN_MANIFEST = [
  { id: 'antislop', name: 'Antislop gates', desc: 'banned vocabulary, banned structures, punctuation discipline, slop detection', provides: ['skills', 'detection'] },
  { id: 'pipeline', name: 'Full pipeline', desc: 'premise, bible, layered outline, chunked drafting, rolling memory, revision, export', provides: ['stages'] },
  { id: 'agents', name: 'Agent crew', desc: 'Architect, Writer, Critic, Continuity, Editor with QA gates and two human gates', provides: ['coordination'] },
  { id: 'rollingMemory', name: 'Rolling memory', desc: 'chapter summaries in a vector store, location/subplot retrieval, subplot tracker', provides: ['memory'] },
];
