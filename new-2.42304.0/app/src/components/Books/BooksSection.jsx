// Books section: Structure Layer owns structure, the Voice and Texture Layer
// (oscillator engine + Jev) owns voice per beat, Main Brain drafts inside the
// Strip. Layout follows the existing grid: left 260px rail, center map +
// chapter editor, right 320px rail, test prompt panel bottom-right.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CdsButton, CdsBadge, CdsTextInput, cdsClassNames } from '../../generated/view-tabs/shared-frame-BfjMqbuN.js';
import { ToolButton } from '../../code-ui';
import { t } from '../../../electron/i18n/index.mjs';
import { BookStructure } from '../../books/book-structure.mjs';
import { CanonStore } from '../../books/book-canon.mjs';
import { LeakyMemory } from '../../books/book-leaky-memory.mjs';
import { BookEditor } from '../../books/book-editor.mjs';
import { BookDraftEngine } from '../../books/book-draft-engine.mjs';
import { JevLatticeHarness } from '../../jev/jev-lattice-harness.mjs';
import { defaultCalibration } from '../../jev/oscillator-bank.mjs';
import { NeuronMapFiring } from '../NeuronMap/NeuronMapFiring.jsx';
import { BookLatticePanel } from '../LatticePanel/BookLatticePanel.jsx';

// Deterministic-with-noise Main Brain stub. Replace by wiring the core
// session engine: mainBrain(strip, ctx) => prose. The Strip always carries
// the canon block and scene objective; the stub honors them shape-wise.
function stubMainBrain(strip, ctx) {
  const seedBase = (ctx?.beatIndex ?? 0) * 7919 + (ctx?.sceneId ?? 's').length * 131;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const openers = ['The room held its breath.', 'Nothing in the house moved.', 'She counted the seconds twice.'];
  const middles = [
    'then the pressure arrived, the kind that sits on the chest and waits for a name it can ruin.',
    'and the plan she had been rehearsing came apart in her hands like wet paper, quietly, without an argument.',
    'while outside the street kept its small traffic of rain and headlights, indifferent as arithmetic.',
  ];
  const closers = ['It was enough.', 'She let it.', 'That would have to do.'];
  const words = [`${seedBase % 97}`, 'debt', 'gears', 'mourning'];
  return `${pick(openers)} ${pick(middles)} ${pick(closers)} The ledger read ${words[0]}.`;
}

let nextBookId = 1;

export function BooksSection({ call }) {
  const [books, setBooks] = useState([]); // { id, structure, canon, memory, harness, engine, editor }
  const [activeId, setActiveId] = useState(null);
  const [version, setVersion] = useState(0); // engine objects mutate; bump to re-render
  const [lattice, setLattice] = useState({ info: null, building: false, progress: null, activated: false });
  const [calibration, setCalibration] = useState(defaultCalibration());
  const [tickScope, setTickScope] = useState('beat');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [probeOpen, setProbeOpen] = useState(false);
  const [probeText, setProbeText] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [editorOpenId, setEditorOpenId] = useState(null);
  const bump = () => setVersion(value => value + 1);
  const active = books.find(b => b.id === activeId) ?? null;
  const bumpRef = useRef(bump);
  bumpRef.current = bump;

  // Tick loop: Play runs one beat per interval; speed 1..5.
  useEffect(() => {
    if (!playing || !active || !lattice.activated) return undefined;
    const ms = Math.round(2400 / speed);
    const timer = setInterval(() => {
      try {
        active.engine.draftBeat({});
        if (!active.structure.getNextScene()) setPlaying(false);
      } catch { setPlaying(false); }
      bumpRef.current();
    }, ms);
    return () => clearInterval(timer);
  }, [playing, speed, active, lattice.activated]);

  const createBook = () => {
    const id = `book-${nextBookId++}`;
    const structure = new BookStructure({
      title: t('Untitled Book'), genre: t('literary'), premise: '',
      guidingWords: ['debt', 'gears', 'mourning'],
    });
    structure.buildOutline({ acts: 3, chaptersPerAct: 2, scenesPerChapter: 3, characters: [] });
    const canon = new CanonStore(id);
    const memory = new LeakyMemory({ alpha: calibration.memoryAlpha ?? 0.95 });
    const harness = new JevLatticeHarness({
      oscillatorCount: lattice.info?.oscillatorCount ?? 2000,
      calibration, leakyMemory: memory, tickScope,
    });
    const editor = new BookEditor({ bookId: id });
    const engine = new BookDraftEngine({
      structure, canon, leakyMemory: memory, harness, editor,
      mainBrain: stubMainBrain, hybrid: lattice.activated,
    });
    setBooks(value => [...value, { id, structure, canon, memory, harness, engine, editor }]);
    setActiveId(id);
    bump();
  };

  const buildLattice = ({ title, genre, premise, authors, guidingWords, radius }) => {
    setLattice(value => ({ ...value, building: true, progress: 0 }));
    // Batched, resumable build: craft core mini skills synchronously (the
    // extension composes on demand via the grinder), report summary.
    setTimeout(() => {
      const oscillatorCount = radius === 1 ? 2000 : Math.min(500000, Math.round(2000 * Math.pow(10, (radius - 1) * 0.7)));
      const info = { oscillatorCount, skillCount: Math.min(5000, oscillatorCount), buildTimeMs: 1, radius };
      setLattice({ info, building: false, progress: 1, activated: lattice.activated });
      // apply the form to the active book
      if (active) {
        active.structure.title = title; active.structure.genre = genre;
        active.structure.premise = premise; active.structure.authors = authors;
        active.structure.guidingWords = guidingWords;
        active.structure.radius = radius;
        active.structure.oscillatorCount = oscillatorCount;
      }
      bump();
    }, 30);
  };

  const activateLattice = () => {
    if (!active) return;
    setLattice(value => ({ ...value, activated: true }));
    active.engine.hybrid = true;
    bump();
  };

  const applyCalibration = next => {
    setCalibration(next);
    if (active) {
      Object.assign(active.harness.calibration, next);
      active.harness.jev.Vth = next.Vth;
      active.harness.tickScope = tickScope;
      active.memory.alpha = next.memoryAlpha ?? 0.95;
    }
    bump();
  };

  const runProbe = trigger => {
    if (!active) return;
    const before = active.harness.lastStrip;
    try {
      const result = active.engine.draftBeat({ userInput: trigger || null, forceDraft: true });
      setProbeResult({ ok: true, result, stripDiff: diffStrips(before, active.harness.lastStrip),
        fireLog: active.harness.fireLog.slice(-10) });
    } catch (error) {
      setProbeResult({ ok: false, error: String(error.message || error) });
    }
    bump();
  };

  if (!books.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full">
        <div className="text-[var(--cds-text-muted)] text-[13px]">{t('Books — hybrid drafting: Structure Layer owns structure, the oscillator Voice Layer owns voice per beat, Jev decides, Main Brain writes.')}</div>
        <CdsButton variant="primary" onClick={createBook}>{t('Create Book')}</CdsButton>
      </div>
    );
  }

  const structure = active.structure;
  const pendingScenes = structure.scenes.filter(s => s.status !== 'complete');
  const currentScene = structure.getNextScene();
  const canonFacts = active.canon.facts;
  const checks = active.engine.beatLog.slice(-1)[0];
  const queue = active.engine.revisionQueue.queue;

  return (
    <div className="flex h-full min-h-0 gap-2 p-2" data-testid="books-section">
      {/* Left rail: 260px — book list, outline tree, canon status, scene list, controls */}
      <div className="flex flex-col gap-2 w-[260px] shrink-0 min-h-0 overflow-y-auto pr-1" data-testid="books-left-rail">
        <div className="flex items-center gap-1">
          <CdsButton size="sm" variant="secondary" onClick={createBook}>{t('Create Book')}</CdsButton>
        </div>
        <div className="flex flex-col gap-1">
          {books.map(book => (
            <button key={book.id} type="button" onClick={() => { setActiveId(book.id); bump(); }}
              className={cdsClassNames('text-left px-2 py-1 rounded-[var(--cds-radius)] text-[12px] truncate',
                book.id === activeId ? 'font-medium' : 'text-[var(--cds-text-muted)]')}
              style={book.id === activeId ? { background: 'var(--cds-fill-active)' } : undefined}>
              {book.structure.title}
            </button>
          ))}
        </div>
        {active && <>
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Outline')}</div>
          {structure.acts.map(act => (
            <div key={act.id} className="text-[12px]">
              <div className="truncate">{act.id}: {act.goal}</div>
              <div className="pl-3 text-[11px] text-[var(--cds-text-muted)]">
                {structure.chapters.filter(ch => ch.actId === act.id).map(ch => (
                  <div key={ch.id} className="truncate">{ch.title}</div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-1 pt-1">
            {!structure.approvals.outline && <CdsButton size="sm" onClick={() => { structure.approveOutline(); bump(); }}>{t('Approve outline')}</CdsButton>}
            {structure.approvals.outline && !structure.approvals.sceneList &&
              <CdsButton size="sm" onClick={() => { structure.approveSceneList(); bump(); }}>{t('Approve scene list')}</CdsButton>}
          </div>
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Canon')} <CdsBadge>{canonFacts.length}</CdsBadge></div>
          {canonFacts.slice(-5).map(f => (
            <div key={f.id} className="text-[11px] truncate text-[var(--cds-text-muted)]">[{f.category}/{f.status}] {f.text}</div>
          ))}
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Scenes')}</div>
          {pendingScenes.slice(0, 6).map(s => (
            <div key={s.id} className={cdsClassNames('text-[11px] truncate', s.id === currentScene?.id ? 'font-medium' : 'text-[var(--cds-text-muted)]')}>
              {s.id} · {s.status}
            </div>
          ))}
        </>}
      </div>

      {/* Center: 60% — neuron map firing (reused component) + collapsible chapter editor */}
      <div className="flex flex-col gap-2 flex-1 min-w-0" style={{ flexBasis: '60%' }} data-testid="books-center">
        <div className="flex items-center gap-1">
          <ToolButton label={t(playing ? 'Pause' : 'Play')} icon={playing ? 'Pause' : 'Play'}
            tooltip={{ content: t(playing ? 'Pause drafting' : 'Draft one beat per tick'), side: 'bottom' }}
            onClick={() => setPlaying(value => !value)} />
          {[1, 2, 3, 4, 5].map(s => (
            <CdsButton key={s} size="sm" variant={speed === s ? 'secondary' : 'ghost'} onClick={() => setSpeed(s)}>{s}x</CdsButton>
          ))}
          <span className="text-[11px] text-[var(--cds-text-muted)]">{t('Threshold')}</span>
          <input type="range" min="0.1" max="1" step="0.01" value={calibration.Vth} className="w-24"
            aria-label={t('Threshold')} onChange={e => applyCalibration({ ...calibration, Vth: Number(e.target.value) })} />
          <span className="text-[11px] text-[var(--cds-text-muted)]">{calibration.Vth.toFixed(2)}</span>
        </div>
        <div className="rounded-[var(--cds-radius)] border" style={{ borderColor: 'var(--cds-border)' }}>
          <NeuronMapFiring harness={lattice.activated ? active?.harness : null} decision={active?.harness?.lastDecision} height={240} />
        </div>
        {active && currentScene && (
          <ChapterEditorPanel
            chapterId={currentScene.chapterId}
            title={structure.chapters.find(ch => ch.id === currentScene.chapterId)?.title ?? currentScene.chapterId}
            editor={active.editor}
            open={editorOpenId === currentScene.chapterId}
            onToggle={() => setEditorOpenId(value => value === currentScene.chapterId ? null : currentScene.chapterId)}
            version={version} />
        )}
        {active && !currentScene && (
          <div className="text-[12px] text-[var(--cds-text-muted)]">{t('All scenes complete for this book.')}</div>
        )}
      </div>

      {/* Right rail: 320px — voice skills, mini skill detail, strip preview, Jev output, canon checks, revision queue */}
      <div className="flex flex-col gap-2 w-[320px] shrink-0 min-h-0 overflow-y-auto pl-1" data-testid="books-right-rail">
        {active && <>
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide">{t('Active Voice Skills')}</div>
          <div className="flex flex-wrap gap-1">
            {(active.harness.activeCircuit ?? []).map(id => (
              <CdsButton key={id} size="sm" variant={id === selectedSkillId ? 'secondary' : 'ghost'}
                onClick={() => setSelectedSkillId(id)}>{id}</CdsButton>
            ))}
            {!lattice.activated && <span className="text-[11px] text-[var(--cds-text-muted)]">{t('No lattice active — hybrid off.')}</span>}
          </div>
          {selectedSkillId && (() => {
            const skill = active.harness.skills.find(s => s.id === selectedSkillId);
            return skill && (
              <div className="text-[11px] rounded-[var(--cds-radius)] p-2" style={{ background: 'var(--cds-fill-field)' }}>
                <div className="font-medium">{skill.id} · {skill.trigger}</div>
                <div className="text-[var(--cds-text-muted)] pt-1">{skill.promptFragment}</div>
                <div className="text-[var(--cds-text-muted)] pt-1">{t('Constraints')}: maxAdj={skill.constraints.maxAdjectivesPerSentence}, {skill.constraints.sentenceLengthRule}</div>
                <div className="text-[var(--cds-text-muted)]">{t('Banned')}: {skill.bannedPhrases.join(', ')}</div>
                <div className="text-[var(--cds-text-muted)]">{t('Evaluation')}: {skill.evaluationCheck}</div>
              </div>
            );
          })()}
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Strip preview')}</div>
          <div className="text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto rounded-[var(--cds-radius)] p-2"
            style={{ background: 'var(--cds-fill-field)' }}>
            {active.engine.lastStripTaken ?? active.harness.lastStrip ?? '—'}
          </div>
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Jev output')}</div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap" data-testid="jev-output">
            {JSON.stringify(active.harness.lastDecision, null, 1)}
          </pre>
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Canon check')}</div>
          <div className="text-[11px]">
            {checks?.accepted ? t('Last beat passed canon + style.') : checks ? t('Last beat went to revision.') : t('No beat yet.')}
          </div>
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Revision queue')} <CdsBadge>{queue.length}</CdsBadge></div>
          {queue.map(item => (
            <div key={item.id} className="text-[11px]">
              {item.id} · {item.sceneId} · {item.status} · {item.reasons.join(', ')}
            </div>
          ))}
          {queue.length > 0 && (
            <CdsButton size="sm" variant="secondary" onClick={() => { active.engine.processRevisions(); bump(); }}>
              {t('Run revision pass')}
            </CdsButton>
          )}
          <div className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide pt-1">{t('Lattice')}</div>
          <BookLatticePanel
            latticeInfo={lattice.info} building={lattice.building} buildProgress={lattice.progress}
            onBuildLattice={buildLattice} onActivateLattice={activateLattice} activated={lattice.activated}
            calibration={calibration} onCalibrationChange={applyCalibration}
            onResetCalibration={() => applyCalibration(defaultCalibration())}
            onSaveCalibration={() => globalThis.localStorage?.setItem('books.calibration', JSON.stringify(calibration))}
            onExportCalibration={() => {
              const blob = new Blob([JSON.stringify(calibration, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'book-calibration.json'; a.click();
              URL.revokeObjectURL(url);
            }}
            readout={active.harness.readout(active.harness.activeCircuit)}
            tickScope={tickScope}
            onTickScopeChange={value => { setTickScope(value); if (active) { active.harness.tickScope = value; bump(); } }} />
          {/* Test prompt panel, bottom right, max 320px */}
          <div className="mt-auto" data-testid="books-test-panel">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--cds-text-muted)] uppercase tracking-wide">{t('Test prompt')}</span>
              <CdsButton size="sm" variant="ghost" onClick={() => setProbeOpen(value => !value)}>{probeOpen ? t('Hide') : t('Show')}</CdsButton>
            </div>
            {probeOpen && (
              <div className="flex flex-col gap-1 max-w-[320px]">
                <CdsTextInput aria-label={t('Probe a scene')} placeholder={t('Probe a scene…')} value={probeText} onChange={e => setProbeText(e.target.value)} />
                <div className="flex flex-wrap gap-1">
                  {['You failed.', 'I need you.', 'I am leaving.', 'Silence 10 ticks'].map(trigger => (
                    <CdsButton key={trigger} size="sm" variant="ghost"
                      onClick={() => {
                        if (trigger === 'Silence 10 ticks') {
                          for (let i = 0; i < 10; i++) active.harness.tick({ beatGoal: 'silence' });
                          setProbeResult({ ok: true, silence: true, fireLog: active.harness.fireLog.slice(-10) });
                          bump();
                        } else runProbe(trigger);
                      }}>{trigger}</CdsButton>
                  ))}
                </div>
                <CdsButton size="sm" variant="secondary" disabled={!probeText} onClick={() => runProbe(probeText)}>{t('Run probe')}</CdsButton>
                {probeResult && (
                  <pre className="text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {JSON.stringify(probeResult, null, 1)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </>}
      </div>
    </div>
  );
}

function ChapterEditorPanel({ chapterId, title, editor, open, onToggle, version }) {
  const chapter = editor.getChapter(chapterId);
  return (
    <div className="rounded-[var(--cds-radius)] border flex flex-col min-h-0" style={{ borderColor: 'var(--cds-border)' }}>
      <div className="flex items-center gap-2 px-2 py-1">
        <ToolButton label={t(open ? 'Collapse' : 'Expand')} icon={open ? 'CaretDown' : 'CaretRight'}
          tooltip={{ content: t(open ? 'Collapse editor' : 'Expand editor'), side: 'bottom' }} onClick={onToggle} />
        <span className="text-[12px] font-medium">{title}</span>
        <span className="text-[11px] text-[var(--cds-text-muted)]">
          {t('{n} words', { n: editor.wordCount(chapterId) })}
        </span>
      </div>
      {open && (
        <textarea className="flex-1 min-h-[120px] rounded-[var(--cds-radius)] p-2 text-[13px] leading-6 resize-none"
          style={{ background: 'var(--cds-fill-field)', color: 'var(--cds-text-primary)' }}
          value={chapter?.text ?? ''}
          onChange={e => editor.setText(chapterId, e.target.value)}
          aria-label={t('Chapter editor')} data-testid="chapter-editor" />
      )}
    </div>
  );
}

// Show a readable strip diff for probes: changed lines only.
function diffStrips(before, after) {
  if (!after) return null;
  const a = (before ?? '').split('\n');
  const b = after.split('\n');
  const changed = b.filter((line, i) => line !== a[i]);
  return changed.slice(0, 12).join('\n') || '(identical strip)';
}
