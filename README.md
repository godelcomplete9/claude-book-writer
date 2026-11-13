<div align="center">

# OpenClaude Desktop

### A 1:1 open-source recreation of Claude Desktop, running the AI you choose

**English** · [简体中文](README.zh-CN.md)

![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon-000000?logo=apple&logoColor=white)
![Cores](https://img.shields.io/badge/cores-DeepSeek%20·%20Codex%20·%20Kimi%20·%20Gemini%20·%20more-4D6BFE)
![Languages](https://img.shields.io/badge/UI-English%20%2F%20简体中文-D97757)
[![MIT License](https://img.shields.io/badge/license-MIT-2EA44F)](LICENSE)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="new-2.42304.0/docs/images/session-dark-en.png">
  <img src="new-2.42304.0/docs/images/session-en.png" alt="OpenClaude Desktop" width="100%">
</picture>

</div>

<br>

## What it is

The official Claude Desktop Code interface, recreated 1:1. Not a look-alike: the components are sliced out of the official app by generators and run as they are, with a thin host layer that lets them drive other AI cores.

- **Same UI, same behavior**: sidebar, composer and environment bar, transcript (working line, tool rows, diffs), task list and next-step box, session rail with the Context breakdown, settings, menus and shortcuts.
- **Same features**: permission modes, plans, side chats, routines, dynamic workflows, terminal, preview, files and changes panes, MCP, skills, plugins and hooks.
- **Your AI**: DeepSeek Harness (built in), Codex, Kimi, Qwen, MiniMax, Gemini, OpenCode, ZCode, MiMo, or any OpenAI-compatible endpoint. Per-model display names, context windows and image input.
- **No Claude account**: pay your provider directly. Settings and history stay on your Mac.

## Versions

| Folder | UI | Recreated from |
|---|---|---|
| [`new-2.42304.0/`](new-2.42304.0/) | **New UI** (recommended) | Claude Desktop 2.42304.0 |
| [`old-2.31226.0/`](old-2.31226.0/) | Old UI (0.2.186, before Claude 2.1.302 / October 16) | Claude Desktop 2.31226.0 |

Each folder is a complete source tree. Run the commands below inside the one you pick.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="new-2.42304.0/docs/images/home-en.png" alt="Home"></td>
    <td width="50%"><img src="new-2.42304.0/docs/images/session-dark-en.png" alt="Dark mode"></td>
  </tr>
  <tr>
    <td width="50%"><img src="new-2.42304.0/docs/images/slash-commands-en.png" alt="Slash commands"></td>
    <td width="50%"><img src="new-2.42304.0/docs/images/settings-models-en.png" alt="Models"></td>
  </tr>
</table>

## Core features

<table>
  <tr>
    <td width="50%"><img src="new-2.42304.0/docs/images/workflow-en.png" alt="Dynamic Workflow"><br><b>Dynamic Workflow</b>: phases and agents, live in Background tasks</td>
    <td width="50%"><img src="new-2.42304.0/docs/images/task-list-en.png" alt="Task list"><br><b>Task list</b> and the working line with the running tool</td>
  </tr>
  <tr>
    <td width="50%"><img src="new-2.42304.0/docs/images/next-step-en.png" alt="Next step"><br><b>Next step</b> box at the end of a turn</td>
    <td width="50%"><img src="new-2.42304.0/docs/images/context-en.png" alt="Context"><br><b>Context</b> breakdown in the session rail</td>
  </tr>
  <tr>
    <td width="50%"><img src="new-2.42304.0/docs/images/approval-en.png" alt="Approval"><br><b>Approval</b> card for a command</td>
    <td width="50%"><img src="new-2.42304.0/docs/images/side-chat-en.png" alt="Side chat"><br><b>/btw</b> side chat next to the session</td>
  </tr>
  <tr>
    <td width="50%"><img src="new-2.42304.0/docs/images/changes-en.png" alt="Changes"><br><b>Changes</b> pane with the session diff</td>
    <td width="50%"><img src="new-2.42304.0/docs/images/model-effort-dark-en.png" alt="Effort"><br>Model menu with the <b>Effort</b> submenu (dark)</td>
  </tr>
</table>

## Install

You need a Mac with Apple silicon, [Node.js](https://nodejs.org) 22.19 or newer (`brew install node`) and an API key for your provider ([DeepSeek](https://platform.deepseek.com/api_keys) is the default).

```bash
git clone https://github.com/oleyyu/OpenClaudeDesktop.git
cd OpenClaudeDesktop/new-2.42304.0/harness && npm install
cd ../app && npm install
npm run package
```

The app lands in `OpenClaudeDesktop/new-2.42304.0/releases/OpenClaude Desktop-darwin-arm64/`; drag it into Applications. To try it without packaging, run `npm run build && npm start` in `app/`.

> Building needs the `reference/` assets (fonts, icons), which aren't in this repository. In mainland China, `npm config set registry https://registry.npmmirror.com` speeds up `npm install`.

On first launch, pick a core and connect a model (an official API key, or any endpoint's base URL and key). Change it later in **Settings › Models**.

## FAQ

- **The core never connects**: usually Node.js is older than 22.19. Run `node -v`, then `brew upgrade node`.
- **What does it cost?** The app is free; you pay your provider for what you use (Settings › Usage).
- **Where is my data?** On your Mac: `~/Library/Application Support/OpenClaude Desktop/` and, for DeepSeek, `~/.dsh/`. Only the conversation goes to the provider you chose.

## For contributors

`app/` is the Electron + React app (official components in `app/src/generated/`, one generator per area in `app/scripts/extract-*.mjs`); `harness/` connects the cores. Tests: `npm test` in `app/` and in `harness/`.

## Books — hybrid drafting

The fifth surface: a book-writing workspace that keeps the app's design system and adds one new mode after Claude and Code.

- **Structure Layer** (`app/src/books/book-structure.mjs`, class `BookStructure`) — traditional, deterministic, perfect recall. It owns the premise, outline, acts, setups and payoffs, character arcs, pacing and the scene list. Oscillators never touch it: changing oscillator calibration provably does not change outline or scene order (see `app/tests/books-structure.test.mjs`).
- **Voice and Texture Layer** — the oscillator engine. Per beat it picks voice, emotion, rhythm, image and tension skills, and builds the **Strip** (canon block + scene objective + one Mini Skill fragment per active oscillator + leaky memory + anti-slop bans + output rules). It owns only *how* a scene is written, never *what* happens in it.
- **Main Brain** — the Claude clone LLM. It writes prose inside the Strip. It does not decide.
- **Canon Store** (`app/src/books/book-canon.mjs`, class `CanonStore`) — perfect recall, non-decaying. Facts are injected into every Strip, every draft, every revision. LeakyMemory (`book-leaky-memory.mjs`) is separate: decaying character psychology (`alpha^k`), used for voice variety, never for facts.
- **Jev** (`app/src/jev/jev-decision-model.mjs`, class `JevDecisionModel`) — the decision model. One instance per session; input is a state vector, output is one decision JSON (`{gate, fire, templateId, shift, couplingDelta, gainDelta, evaluation, confidence}`). It scores all candidate templates in one matmul (`scores = s(t) @ W + b`), fires when the score crosses `Vth`, and learns from +1/−1 rewards (voice variety, motivated contradiction rewarded; canon contradiction, flat rhythm punished). Jev never decides canon, outline, act order or scene order.
- **Jev-Lattice** (`app/src/jev/jev-lattice-harness.mjs`, class `JevLatticeHarness`) — the harness. It holds the oscillators, the world model, LeakyMemory, the Strip builder and the tick loop. **A tick is a beat, not a sentence**: one Jev call per beat (3–8 beats per scene), which bounds the cost of an 80,000-word book.

### The oscillator engine, documented

The engine (`app/src/jev/oscillator-bank.mjs`) is a bank of N oscillators held as flat typed arrays and updated **vectorized** — never one LLM call per oscillator:

- **Phase**: `phase = (phase + 2π·hz·dt) mod 2π`, amplitude, refractory and fatigue all advance in one array pass.
- **Domains D01–D12**: Identity, Resources, Communication, Home, Creation, Work, Partnership, Transformation, Meaning, Public Role, Collective, Subconscious. The writer-shaped funcs: Voice, Character Voice, Emotion, Flaw, Want-vs-Need, Worldview, Rhythm, Image, Scene Objective, Other Characters, World Facts, Plot Pressure, Reader Tension, Memory — used for voice and texture only.
- **Banks**: internal (Voice 1.0 Hz, Character Voice 0.8, Emotion 0.4, Flaw / Want-vs-Need 0.08, Worldview 0.05, Rhythm 1.2, Image 0.5) and external (Scene Objective 1.0, Other Characters 0.6, World Facts 0.07, Plot Pressure 0.4, Reader Tension 0.3, Memory 0.05).
- **Scale**: minimum 2,000 oscillators per book, target 20,000, up to 500,000 at radius 10. Core oscillators (2,000–5,000) are fully crafted **Mini Skills** (`app/src/jev/mini-skills.mjs`) with `trigger`, `promptFragment`, `constraints`, `bannedPhrases` and `evaluationCheck` — the style-enforcement mechanism. The rest are **composed on demand**: `V = V_domain + V_func + V_mode + V_stance + V_move + V_purpose`.
- **Grinder**: retrieval is one batched vector search — embedding similarity of every oscillator against the beat query in a single pass, plus a phase-alignment term — then top K = 8–16.
- **Coherence is a matrix**: `coherence = V·Vᵀ` over the candidate slice, one Gram-matrix pass, not a pairwise JS loop.
- **Lock resonance gating**: a Mini Skill gates only when `phaseDiff < lockTolerance` (default 0.4 rad) **and** `coherence > lockThreshold` (default 0.6). A skill with high embedding similarity but low phase lock does *not* gate. Skills that lock together form a **voice circuit** for the beat (e.g. Character Voice + Emotion + Rhythm).
- **Fatigue, bans and per-beat Strip rebuilding** fight the usual LLM prose problems: fatigue makes the voice shift after repeated precise moves; bans block repeated phrasing; rebuilding the Strip per beat keeps the rhythm from going flat.
- **Noise is never zero** — two runs of the same scene are recognizably the same book, not a replay. Noise applies to voice; `CanonCheck` removes noise-driven canon errors.
- **Memory split**: `I(t) = g_ext·I_ext + g_sim·I_sim + g_self·I_self + noise`. When input goes silent, `g_ext` drops and `g_sim`/`g_self` rise (Echo → Simulation → Drift); a watchdog injects a self prompt after 10 silent ticks. `I_sim` comes from the world model's predictor (fast loop: thought → predict → prediction becomes `I_sim`; medium loop: prediction error updates coupling).

### Where the oscillators came from

In 2023 I was trying to write prose that didn't sound like a language model, and prompting never got there — a prompt is one request, and a voice is many. So I started modeling writers as sets of drives firing at different frequencies and letting them interfere. The first three characters I tried were Terry A. Davis, Nietzsche and Saint John the Revelator: an obsessive construction drive against a slow isolation pull, aphorism compression contradicting itself every few beats, and a seven-fold vision sequence that returns on phase. Book excerpts written that way read original — not pastiche — because the voice was the interference pattern, not an imitation of it.

That experiment became this engine. Its point is to take any set of ontologies and characters and break it down into a **defined set of oscillators** — 2,000 in a sketch, 20,000 for a book, up to 100,000,000 at full scale — each with a frequency, phase, amplitude, fatigue and refractory state, all updated in one vectorized pass and retrieved by the grinder per beat. The engine is not "these three writers"; they were the first calibration marks. Whatever ontology you give it — a novelist, a philosopher, a liturgy, your own cast — decomposes the same way, and the lattice reconstructs the voice from interference.

Plain drafting gives you one voice baked at sampling temperature. The hybrid gives you interference — and interference is what reads as a person.

### Pipeline plugins and skills

Full automation is not one prompt that says "write an 80k book". It is a pipeline that plans first, writes in small chunks, checks itself, and rewrites. These ship as plugins (`app/src/books/plugins/`) and Jev-gated skills (`app/src/books/book-skills.mjs`) the book writer can switch on:

- **Six stages** (`pipeline-outline.mjs`): premise → outline → bible → sequential chapter generation → revision → export. Work hierarchically; the outline is the highest leverage part, and the whole outline — every chapter, in order — must exist before a single word of prose (enforced by `OutlineLock`; if the model invents plot as it goes, it repeats itself by chapter 8).
- **Premise and constraints** (`PremiseSpec`): genre, audience, length, POV, tense, tone, logline/thesis, and what the book must *not* do — fed into every later agent. Incomplete premises are refused.
- **Book Bible** (`BookBible`): one JSON source of truth — characters with age, voice, wounds, goals, speech tics, relationships and wants-vs-said-wants; world rules, timeline, locations, key terms; for nonfiction, chapter theses plus sources. Every writer call gets the relevant slice, never the whole bible.
- **Chapter cards**: 25–40 cards for a 75k novel (~2,500 words each), each with goal, conflict, what changes, who appears, cliffhanger, target word count. Chunked drafting: 800–1,500 words covering 2–3 beats per call, never a whole chapter.
- **Rolling memory** (`pipeline-memory.mjs`): each chapter is auto-summarized (250–400 words) into a vector store. The next chapter retrieves the last summary, relevant character sheets, and past scenes sharing a location or subplot — plus a subplot tracker so B plots do not vanish for 10 chapters.
- **Agent crew** (`pipeline-agents.mjs`): Architect (bible + outline, runs once), Writer (one chunk at a time), Critic (scores the checklist, flags slop and logic gaps), Continuity (names, dates, facts against the bible), de-slop Editor (cut, do not add — runs once at the end). Orchestration: Architect once, Writer+Critic per chapter until the score passes the threshold, Editor once. Rewrites are targeted: flagged paragraphs only, never a whole chapter.
- **QA gates and two human gates**: word count within 10%, zero banned phrases, repetition below threshold, continuity pass — everything in between auto-approves on gate pass. Gate 1 approves premise plus outline; Gate 2 skims the final draft before export.
- **Antislop measures** (`plugins/antislop.mjs`): banned vocabulary (delve, tapestry, realm, journey, unlock, empower…), banned structures ("it is worth noting", "not only X but also Y", rule-of-three lists, moralizing endings), punctuation discipline (≤1 em dash per 500 words, limited rhetorical questions, no three same-start sentences), sentence-length variance (4-word against 30-word), concreteness rule (every paragraph carries a specific noun, number, sensory detail, decision, or dialogue), generation presets (fiction 0.7–0.9 temperature, nonfiction 0.3–0.5), the detection script per chapter (banned counts, n-gram repetition, overused crutch words, dialogue/citation ratios, three-endings-in-a-row flag), a nonfiction fact pass (no statistic, quote or date without a source), and the de-slop edit.
- **Voice DNA**: 3–5 pages of human sample text plus words you use and words you never use — the Writer's style sheet, more powerful than a banned list alone.

As skills, the same measures become Mini Skills (`craftPipelineSkills()`): concreteness, banned-vocabulary, punctuation-discipline, sentence-variance, rolling-memory, continuity, de-slop, scene-structure (fiction: action → reaction → decision → consequence) or claim-structure + fact-check (nonfiction: claim → evidence → example → implication). They compose with the oscillator bank, gate through Jev like core skills, and their constraints are enforced per beat by `styleCheck`. Pass them to `BookDraftEngine` via `plugins`, and add `rollingMemory` to inject the rolling summary into every Strip.

### Tests and benchmarks

```bash
cd new-2.42304.0/app
npm test                     # includes books-structure, books-canon, books-drafting, books-plugins (Jev, lock, fatigue, plain-mode, pipeline, antislop)
node benchmarks/plain-vs-hybrid.mjs   # plain vs hybrid; results in benchmarks/results.json
```

## License

[MIT](LICENSE).

> **Disclaimer**: OpenClaude Desktop is an unofficial community project, not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic, used only to describe the interface.
