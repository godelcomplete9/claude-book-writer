// BookLatticePanel: the oscillator instantiation and calibration panel,
// extended with the Book Lattice mode. Same panel, one new mode toggle:
// Code Lattice / Book Lattice (default: last used).
import React, { useEffect, useState } from 'react';
import { CdsButton, CdsTextInput, CdsBadge, cdsClassNames } from '../../generated/view-tabs/shared-frame-BfjMqbuN.js';
import { SourceSwitch } from '../../source-switch.jsx';
import { t } from '../../../electron/i18n/index.mjs';
import { defaultCalibration } from '../../jev/oscillator-bank.mjs';

const MODE_KEY = 'books.latticeMode';

export function BookLatticePanel({
  latticeInfo = null, building = false, buildProgress = null,
  onBuildLattice, onActivateLattice, activated = false,
  calibration, onCalibrationChange, onResetCalibration, onSaveCalibration, onExportCalibration,
  readout = null, tickScope, onTickScopeChange,
}) {
  const [mode, setMode] = useState(() => globalThis.localStorage?.getItem(MODE_KEY) ?? 'book');
  useEffect(() => { globalThis.localStorage?.setItem(MODE_KEY, mode); }, [mode]);
  const [tab, setTab] = useState('instantiate');
  // Book Instantiate form
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [premise, setPremise] = useState('');
  const [authors, setAuthors] = useState('');
  const [guiding, setGuiding] = useState('');
  const [radius, setRadius] = useState(4);
  const c = { ...defaultCalibration(), ...calibration };
  const set = (key, value) => onCalibrationChange?.({ ...calibration, [key]: value });
  const radiusOsc = radius === 1 ? 2000 : Math.round(2000 * Math.pow(10, (radius - 1) * 0.7));
  const radiusMinutes = Math.max(1, Math.round(radiusOsc / 400));
  const radiusMb = Math.max(2, Math.round(radiusOsc * 0.02));

  return (
    <div className="flex flex-col gap-2 p-2 text-[13px]" data-testid="book-lattice-panel">
      {/* Mode toggle: Code Lattice / Book Lattice, default last used */}
      <div className="flex items-center gap-1 p-[3px] rounded-[var(--cds-radius)]" style={{ background: 'var(--cds-fill-field)' }}>
        {[['book', t('Book Lattice')], ['code', t('Code Lattice')]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setMode(value)}
            className={cdsClassNames('flex-1 px-2 py-1 rounded-[calc(var(--cds-radius)-3px)] text-[12px]',
              mode === value ? 'font-medium' : 'text-[var(--cds-text-muted)]')}
            style={mode === value ? { background: 'var(--cds-fill-active)' } : undefined}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'code' && <div className="text-[var(--cds-text-muted)] px-1 py-2">{t('Code Lattice instantiation lives in the existing panel controls.')}</div>}

      {mode === 'book' && <>
        <div className="flex gap-1">
          {[['instantiate', t('Instantiate')], ['calibrate', t('Calibrate')]].map(([v, label]) => (
            <CdsButton key={v} variant={tab === v ? 'secondary' : 'ghost'} size="sm"
              onClick={() => setTab(v)}>{label}</CdsButton>
          ))}
        </div>

        {tab === 'instantiate' && <>
          <CdsTextInput aria-label={t('Book title')} placeholder={t('Book title')} value={title} onChange={e => setTitle(e.target.value)} />
          <CdsTextInput aria-label={t('Genre')} placeholder={t('Genre')} value={genre} onChange={e => setGenre(e.target.value)} />
          <textarea data-cds="TextArea" aria-label={t('Premise')} className="w-full rounded-[var(--cds-radius)] p-2 text-[12px]"
            style={{ background: 'var(--cds-fill-field)', color: 'var(--cds-text-primary)', boxShadow: 'inset 0 0 0 1px var(--cds-fill-field-ring)' }}
            rows={3} value={premise} onChange={e => setPremise(e.target.value)} placeholder={t('Premise')} />
          <CdsTextInput aria-label={t('Reference authors (1-5, comma separated)')} placeholder={t('Reference authors (1-5, comma separated)')} value={authors} onChange={e => setAuthors(e.target.value)} />
          <CdsTextInput aria-label={t('Guiding words (3-7, comma separated)')} placeholder={t('Guiding words (3-7, comma separated)')} value={guiding} onChange={e => setGuiding(e.target.value)} />
          <label className="block px-1">
            <span className="text-[var(--cds-text-muted)]">{t('Hierarchy of ontologies')}: {t('domain')} x {t('func')} x {t('stance')} x {t('move')} x {t('purpose')}</span>
          </label>
          <div className="px-1">
            <div className="flex items-center justify-between text-[12px]">
              <span>{t('Radius / Scale')}: <strong>{radius}</strong></span>
              <span className="text-[var(--cds-text-muted)]">~{radiusOsc.toLocaleString()} {t('oscillators')}</span>
            </div>
            <input type="range" min="1" max="10" step="1" value={radius} aria-label={t('Radius / Scale')}
              className="w-full" onChange={e => setRadius(Number(e.target.value))} />
            <div className="text-[11px] text-[var(--cds-text-muted)]">
              {t('Est. build')}: ~{radiusMinutes} min, ~{radiusMb} MB
            </div>
          </div>
          <CdsButton variant="primary" disabled={building || !title || !premise}
            onClick={() => onBuildLattice?.({ title, genre, premise,
              authors: authors.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5),
              guidingWords: guiding.split(/[\s,]+/).filter(Boolean).slice(0, 7), radius })}>
            {building ? t('Building…') : t('Build Book Lattice')}
          </CdsButton>
          {buildProgress != null && (
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--cds-fill-field)' }}>
              <div className="h-full" style={{ width: `${Math.round(buildProgress * 100)}%`, background: 'var(--cds-fill-accent)' }} />
            </div>
          )}
          {latticeInfo && <>
            <div className="flex flex-wrap gap-1 pt-1">
              <CdsBadge>{t('{count} oscillators', { count: latticeInfo.oscillatorCount })}</CdsBadge>
              <CdsBadge>{t('{count} mini skills', { count: latticeInfo.skillCount })}</CdsBadge>
              <CdsBadge>{t('built in {ms} ms', { ms: latticeInfo.buildTimeMs })}</CdsBadge>
            </div>
            <CdsButton variant="secondary" disabled={activated}
              onClick={() => onActivateLattice?.()}>{activated ? t('Active for current book') : t('Activate for current book')}</CdsButton>
          </>}
        </>}

        {tab === 'calibrate' && <>
          {[
            ['Vth', t('Threshold Vth'), 0, 1, 0.01],
            ['noise', t('Noise (never 0)'), 0.01, 0.5, 0.01],
            ['fatigueDecayPerUse', t('Fatigue decay per use'), 0, 0.5, 0.01],
            ['fatigueRecoveryPerTick', t('Fatigue recovery per tick'), 0, 0.2, 0.01],
            ['couplingStrength', t('Coupling strength'), 0, 1, 0.05],
            ['gExt', 'g_ext', 0, 2, 0.05],
            ['gSim', 'g_sim', 0, 2, 0.05],
            ['gSelf', 'g_self', 0, 2, 0.05],
            ['lockTolerance', t('Lock tolerance (rad)'), 0.05, 1.5, 0.05],
            ['lockThreshold', t('Lock threshold (coherence)'), 0.1, 1, 0.05],
          ].map(([key, label, min, max, step]) => (
            <label key={key} className="block px-1">
              <span className="flex justify-between text-[12px]">
                <span>{label}</span><span className="text-[var(--cds-text-muted)]">{(c[key] ?? 0).toFixed(2)}</span>
              </span>
              <input type="range" min={min} max={max} step={step} value={c[key] ?? 0} className="w-full"
                aria-label={label} onChange={e => set(key, Number(e.target.value))} />
            </label>
          ))}
          <label className="flex items-center justify-between px-1 text-[12px]">
            <span>{t('Memory decay alpha (LeakyMemory only)')}</span>
            <span className="text-[var(--cds-text-muted)]">{(c.memoryAlpha ?? 0.95).toFixed(2)}</span>
          </label>
          <div className="flex items-center justify-between px-1 text-[12px]">
            <span>{t('Tick scope')}</span>
            <div className="flex gap-1">
              {[['beat', t('Jev per beat')], ['scene', t('Jev per scene')]].map(([v, label]) => (
                <CdsButton key={v} size="sm" variant={tickScope === v ? 'secondary' : 'ghost'}
                  onClick={() => onTickScopeChange?.(v)}>{label}</CdsButton>
              ))}
            </div>
          </div>
          {[['parallelFiring', t('Parallel firing')], ['lockResonanceGating', t('Lock resonance gating')], ['tickLoop', t('Tick loop')]].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between px-1 text-[12px]">
              <span>{label}</span>
              <SourceSwitch label={label} checked={!!c[key]} onChange={value => set(key, value)} />
            </div>
          ))}
          <div className="flex gap-1 pt-1">
            <CdsButton size="sm" variant="ghost" onClick={() => onResetCalibration?.()}>{t('Reset to defaults')}</CdsButton>
            <CdsButton size="sm" variant="ghost" onClick={() => onSaveCalibration?.()}>{t('Save')}</CdsButton>
            <CdsButton size="sm" variant="ghost" onClick={() => onExportCalibration?.()}>{t('Export JSON')}</CdsButton>
          </div>
          {readout && <ReadoutPanel readout={readout} />}
        </>}
      </>}
    </div>
  );
}

function ReadoutPanel({ readout }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-1 pt-1" data-testid="lattice-readout">
      <CdsButton size="sm" variant="ghost" onClick={() => setOpen(value => !value)}>{t('Live readout')}</CdsButton>
      {open && (
        <div className="text-[11px] text-[var(--cds-text-muted)] leading-5 pt-1">
          {t('Fire rate')}: {(readout.fireRate * 100).toFixed(0)}%<br />
          {t('Coherence avg')}: {readout.coherenceAverage?.toFixed?.(2) ?? '—'}<br />
          {t('Fatigue avg')}: {readout.fatigueAverage?.toFixed?.(2) ?? '—'}<br />
          {t('Last Jev decision')}: {readout.lastJevDecision
            ? `fire=${readout.lastJevDecision.fire} template=${readout.lastJevDecision.templateId ?? '—'} shift=${readout.lastJevDecision.shift}`
            : '—'}
        </div>
      )}
    </div>
  );
}
