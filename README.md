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

### Oscillators to humanize a writer

The point of the lattice is that no single LLM pass can hold a *human* voice — a voice is many drives firing at different tempos, mostly in conflict. Each oscillator below is a real drive with its own frequency; the book's voice is what you hear when they interfere:

- **Terry A. Davis** (TempleOS): an obsessive construction drive at ~1.2 Hz (every sentence rebuilds the temple brick by brick), a raw unfiltered communion drive at ~1.0 Hz (God talks to him mid-clause, and the prose obeys), and a slow 0.05 Hz isolation pull that keeps circling the same basement imagery. The lattice reproduces this not by asking for "an eccentric style" but by letting the fast construction osc and the slow isolation osc both gate the same beat — compression against recurrence.
- **Nietzsche** (Ecce Homo, Zarathustra): aphorism compression at high frequency (short hammering sentences), a slow 0.08 Hz flaw-drive (contempt turned inward) that keeps contradicting the fast drive, and a worldview osc at 0.05 Hz that forces every beat to re-derive morality from the body. When fatigue accumulates on the aphorism osc, the voice shifts — the middle-period books read measurably different from the late ones because the drive rates drifted.
- **Saint John the Revelator**: a vision-sequencing osc at ~0.4 Hz (seal, trumpet, bowl — a strict seven-fold phase structure the beat must land inside), a liturgy-repetition drive (recurrence as *rhythm*, not redundancy — "and I saw" returns on phase), and a slow 0.05 Hz doxology pull that resolves tension into worship instead of explanation. Lock resonance is exactly this: high-similarity skills that phase-lock form the circuit that produces a voice like Revelation's — repetition without flatness, because each return is phase-shifted.

Plain drafting gives you one voice baked at sampling temperature. The hybrid gives you interference — and interference is what reads as a person.

### Tests and benchmarks

```bash
cd new-2.42304.0/app
npm test                     # includes books-structure, books-canon, books-drafting (Jev, lock, fatigue, plain-mode)
node benchmarks/plain-vs-hybrid.mjs   # plain vs hybrid; results in benchmarks/results.json
```

## License

[MIT](LICENSE).

> **Disclaimer**: OpenClaude Desktop is an unofficial community project, not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic, used only to describe the interface.
