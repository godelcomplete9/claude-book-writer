// Mini Skills: one crystallized writing behavior, gated by Jev.
//
// Each mini skill is one oscillator. Core oscillators (2,000 to 5,000 per
// book) are fully crafted here, deterministically, aligned with their domain
// and template. Extended oscillators are composed on demand:
//   V = V_domain + V_func + V_mode + V_stance + V_move + V_purpose
// Constraints, bannedPhrases and evaluationCheck are the style-enforcement
// mechanism: they fight repeated phrasing, flat rhythm, same sentence shapes.

import { DOMAINS, FUNCS, INTERNAL_BANK_HZ, EXTERNAL_BANK_HZ,
  composeEmbedding, embed } from './oscillator-bank.mjs';

export const DIM = 64;

export function makeMiniSkill({ id, oscillatorId, domain, func, tags = {}, hz }) {
  const dName = DOMAINS[domain] ?? `D${domain + 1}`;
  const fName = FUNCS[func] ?? `F${func}`;
  const stance = tags.stance ?? 'open';
  const move = tags.move ?? 'expand';
  const purpose = tags.purpose ?? 'tension';
  const fragment = [
    `[${dName} / ${fName}] Write from a ${stance} stance; the move is ${move}; the beat exists to ${purpose}.`,
    `Let the ${fName.toLowerCase()} of the ${dName.replace(/^D\d+ /, '')} pressure shape the rhythm of this beat, not its content.`,
  ].join(' ');
  return {
    id,
    oscillatorId,
    domain,
    func,
    trigger: `${fName} required by beat context in ${dName}`,
    promptFragment: fragment,
    examples: [`Example (${fName}, ${stance}): a sentence that carries ${purpose} through ${move}.`],
    constraints: {
      maxAdjectivesPerSentence: 2,
      sentenceLengthRule: 'alternate short (<=9 words) and long (>=18 words) sentences',
      rhythmPattern: `${move === 'compress' ? 'clipped' : move === 'expand' ? 'cascading' : 'alternating'}`,
    },
    bannedPhrases: ['suddenly', 'very', 'quite', 'began to', 'in order to', 'it was then'],
    evaluationCheck: `Does the beat honor ${fName} in ${dName} without violating its constraints?`,
    embedding: composeEmbedding(domain, func, tags, DIM),
    hz,
  };
}

// Build the core lattice: domain x func x stance x move x purpose grid,
// deterministically, until `count` fully crafted mini skills exist.
export function craftCoreSkills(count, seed = 7) {
  const skills = [];
  const stances = ['withheld', 'open', 'lyrical', 'clinical', 'wry'];
  const moves = ['compress', 'expand', 'contrast', 'echo', 'pivot'];
  const purposes = ['tension', 'relief', 'revelation', 'mask', 'charge'];
  const bankOf = func => (func <= 7 ? INTERNAL_BANK_HZ : EXTERNAL_BANK_HZ);
  let i = 0;
  for (let domain = 0; i < count && domain < DOMAINS.length * 1000; domain = (domain + 1) % DOMAINS.length) {
    for (let func = 0; func < FUNCS.length && i < count; func++) {
      for (let s = 0; s < stances.length && i < count; s++) {
        for (let m = 0; m < moves.length && i < count; m++) {
          for (let p = 0; p < purposes.length && i < count; p++) {
            const tags = { stance: stances[(s + (seed % stances.length)) % stances.length],
              move: moves[(m + (seed % moves.length)) % moves.length],
              purpose: purposes[(p + (seed % purposes.length)) % purposes.length] };
            const hz = bankOf(func)[FUNCS[func]] ?? 0.3;
            skills.push(makeMiniSkill({
              id: `core-${i}`,
              oscillatorId: `osc-${i}`,
              domain, func, tags, hz,
            }));
            i++;
          }
        }
      }
    }
  }
  return skills;
}

// Extended oscillator, composed on demand from tag vectors (no crafting).
export function composeExtendedSkill({ index, domain, func, mode, stance, move, purpose }) {
  return makeMiniSkill({
    id: `ext-${index}`,
    oscillatorId: `ext-osc-${index}`,
    domain, func,
    tags: { mode, stance, move, purpose },
    hz: (func <= 7 ? INTERNAL_BANK_HZ : EXTERNAL_BANK_HZ)[FUNCS[func]] ?? 0.3,
  });
}

// Embedding of a beat query: scene objective + recent text + beat goal.
export function beatQueryEmbedding({ sceneObjective, beatGoal, recentText }) {
  return embed([sceneObjective ?? '', beatGoal ?? '', recentText ?? ''].join(' \n '), DIM);
}
