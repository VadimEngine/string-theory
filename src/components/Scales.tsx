import { useState, useRef, useEffect, useCallback } from 'react'
import { NOTE_NAMES, FLAT_NOTE_NAMES, ROOT_NAMES, PC_FROM_A, MIDDLE_C, WHITE_W, playNote, usesFlatEnharmonic } from '../music'
import Piano from './Piano'
import Fretboard, { NoteStyle } from './Fretboard'
import './Scales.css'

// ── Chord groups for the dropdown ────────────────────────────
const CHORD_GROUPS = [
  { label: 'Triads',   types: ['Major', 'Minor', 'Sus2', 'Sus4', 'Diminished'] },
  { label: 'Extended', types: ['Dominant 7', 'Major 7', 'Minor 7', 'Add9'] },
]

// ── Pattern intervals ─────────────────────────────────────────
const SCALE_INTERVALS: Record<string, number[]> = {
  // Pentatonic & Blues
  'Major Pentatonic': [0, 2, 4, 7, 9],
  'Minor Pentatonic': [0, 3, 5, 7, 10],
  'Blues':            [0, 3, 5, 6, 7, 10],
  // Diatonic modes
  'Major':            [0, 2, 4, 5, 7, 9, 11],
  'Minor':            [0, 2, 3, 5, 7, 8, 10],
  'Dorian':           [0, 2, 3, 5, 7, 9, 10],
  'Phrygian':         [0, 1, 3, 5, 7, 8, 10],
  'Lydian':           [0, 2, 4, 6, 7, 9, 11],
  'Mixolydian':       [0, 2, 4, 5, 7, 9, 10],
  'Locrian':          [0, 1, 3, 5, 6, 8, 10],
  // Other heptatonic
  'Harmonic Minor':   [0, 2, 3, 5, 7, 8, 11],
  'Melodic Minor':    [0, 2, 3, 5, 7, 9, 11],
  'Hungarian Minor':  [0, 2, 3, 6, 7, 8, 11],
  'Double Harmonic':  [0, 1, 4, 5, 7, 8, 11],
  // Symmetric
  'Whole Tone':       [0, 2, 4, 6, 8, 10],
  'Diminished':       [0, 2, 3, 5, 6, 8, 9, 11],
  'Chromatic':        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

const SCALE_GROUPS = [
  { label: 'Pentatonic & Blues', types: ['Major Pentatonic', 'Minor Pentatonic', 'Blues'] },
  { label: 'Diatonic Modes',     types: ['Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'] },
  { label: 'Other Scales',       types: ['Harmonic Minor', 'Melodic Minor', 'Hungarian Minor', 'Double Harmonic'] },
  { label: 'Symmetric',          types: ['Whole Tone', 'Diminished', 'Chromatic'] },
]

const SCALE_DISPLAY_NAMES: Record<string, string> = {
  'Major Pentatonic': 'Major Pentatonic',
  'Minor Pentatonic': 'Minor Pentatonic',
  'Blues':            'Blues',
  'Major':            'Major / Ionian',
  'Minor':            'Minor / Aeolian',
  'Dorian':           'Dorian',
  'Phrygian':         'Phrygian',
  'Lydian':           'Lydian',
  'Mixolydian':       'Mixolydian',
  'Locrian':          'Locrian',
  'Harmonic Minor':   'Harmonic Minor',
  'Melodic Minor':    'Melodic Minor',
  'Hungarian Minor':  'Hungarian Minor',
  'Double Harmonic':  'Double Harmonic Major',
  'Whole Tone':       'Whole Tone',
  'Diminished':       'Diminished',
  'Chromatic':        'Chromatic',
}

const SCALE_DESCRIPTIONS: Record<string, string> = {
  'Major Pentatonic': '5-note major, no half steps',
  'Minor Pentatonic': '5-note minor, foundation of rock & blues',
  'Blues':            'Minor pentatonic + blue note (b5)',
  'Major':            'Ionian · Major Scale',
  'Minor':            'Aeolian · Natural minor',
  'Dorian':           'Minor with a bright 6th',
  'Phrygian':         'Dark, Spanish-sounding',
  'Lydian':           'Dreamy, floating',
  'Mixolydian':       'Bluesy, rock',
  'Locrian':          'Unstable, tense',
  'Harmonic Minor':   'Natural minor with raised 7th',
  'Melodic Minor':    'Natural minor with raised 6th & 7th',
  'Hungarian Minor':  'Exotic, gypsy flavor',
  'Double Harmonic':  'Byzantine, Arabic sound',
  'Whole Tone':       'All whole steps, 6-note symmetric',
  'Diminished':       '8-note alternating whole & half steps',
  'Chromatic':        'All 12 semitones',
}
const CHORD_INTERVALS: Record<string, number[]> = {
  'Major':       [0, 4, 7],
  'Minor':       [0, 3, 7],
  'Sus2':        [0, 2, 7],
  'Sus4':        [0, 5, 7],
  'Dominant 7':  [0, 4, 7, 10],
  'Major 7':     [0, 4, 7, 11],
  'Minor 7':     [0, 3, 7, 10],
  'Diminished':  [0, 3, 6],
  'Add9':        [0, 2, 4, 7],
}

type Mode       = 'scales' | 'chords'
type Instrument = 'guitar' | 'piano'

export default function Scales() {
  const [mode, setMode]               = useState<Mode>('scales')
  const [instrument, setInstrument]   = useState<Instrument>('guitar')
  const [root, setRoot]               = useState(4)
  const [patternType, setPatternType] = useState('Major')
  const [showLabels, setShowLabels]   = useState(true)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [chordMode, setChordMode]       = useState(false)

  const audioCtxRef    = useRef<AudioContext | null>(null)
  const pianoScrollRef = useRef<HTMLDivElement>(null)
  const dropdownRef    = useRef<HTMLDivElement>(null)

  const closeDropdown = useCallback(() => setDropdownOpen(false), [])

  useEffect(() => {
    if (!dropdownOpen) return
    function onOutside(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [dropdownOpen, closeDropdown])

  const intervals    = (mode === 'scales' ? SCALE_INTERVALS : CHORD_INTERVALS)[patternType]
  const noteSet      = new Set(intervals.map(i => (root + i) % 12))
  const flatKey      = usesFlatEnharmonic(root, patternType)
  const names        = flatKey ? FLAT_NOTE_NAMES : NOTE_NAMES
  const degreeNames  = intervals.map(i => names[(root + i) % 12])
  if (mode === 'scales') degreeNames.push(names[root])
  const noteList     = degreeNames.join(' – ')
  const patternLabel = mode === 'scales'
    ? `${ROOT_NAMES[root]} ${patternType} Scale`
    : `${ROOT_NAMES[root]} ${patternType}`

  useEffect(() => {
    if (instrument !== 'piano') return
    const el = pianoScrollRef.current
    if (el) el.scrollLeft = MIDDLE_C.left + 24 - el.clientWidth / 2 + WHITE_W / 2
  }, [instrument])

  useEffect(() => () => { audioCtxRef.current?.close() }, [])

  function press(midi: number) {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current
    const play = () => {
      if (chordMode && mode === 'chords') {
        // Root at or to the left of the pressed note (nearest below)
        const semAbove = ((midi - root) % 12 + 12) % 12
        const baseRoot = midi - semAbove
        intervals.forEach(interval => playNote(baseRoot + interval, ctx))
      } else {
        playNote(midi, ctx)
      }
    }
    ctx.state === 'suspended' ? ctx.resume().then(play) : play()
  }

  function getKeyClass(midi: number): string {
    const pc = midi % 12
    if (pc === root) return ' lit-root'
    if (noteSet.has(pc)) return ' lit-scale'
    return ''
  }

  function getNoteDisplay(midi: number): NoteStyle | null {
    const pc = midi % 12
    if (!noteSet.has(pc)) return null
    const isRoot = pc === root
    return {
      fill:      isRoot ? '#4ade80' : 'rgba(255,255,255,0.14)',
      stroke:    isRoot ? 'rgba(74,222,128,0.7)' : 'rgba(255,255,255,0.45)',
      labelFill: isRoot ? '#000' : '#fff',
      label:     names[pc],
    }
  }

  return (
    <div className="scales">

      {/* ── Top selectors row ───────────────────────────────── */}
      <div className="selectors-row">
        <div className="seg-control">
          {(['scales', 'chords'] as Mode[]).map(m => (
            <button key={m}
              className={`seg-btn${mode === m ? ' active' : ''}`}
              onClick={() => {
                const avail = m === 'scales' ? SCALE_INTERVALS : CHORD_INTERVALS
                if (!avail[patternType]) setPatternType('Major')
                if (m === 'scales') setChordMode(false)
                setDropdownOpen(false)
                setMode(m)
              }}
            >{m === 'scales' ? 'Scales' : 'Chords'}</button>
          ))}
        </div>
        <div className="seg-control">
          {(['guitar', 'piano'] as Instrument[]).map(inst => (
            <button key={inst}
              className={`seg-btn${instrument === inst ? ' active' : ''}`}
              onClick={() => setInstrument(inst)}
            >{inst.charAt(0).toUpperCase() + inst.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* ── Pattern type dropdown + chord mode toggle ──────────── */}
      <div className="scale-type-row">
        <div className="pattern-dropdown" ref={dropdownRef}>
          <button
            className={`pattern-trigger${dropdownOpen ? ' open' : ''}`}
            onClick={() => setDropdownOpen(v => !v)}
          >
            <span>{mode === 'scales' ? (SCALE_DISPLAY_NAMES[patternType] ?? patternType) : patternType}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="pattern-menu">
              {mode === 'scales' ? (
                SCALE_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="pattern-group-label">{group.label}</div>
                    {group.types.map(t => (
                      <button key={t}
                        className={`pattern-item${patternType === t ? ' active' : ''}`}
                        onClick={() => { setPatternType(t); setDropdownOpen(false) }}
                      >{SCALE_DISPLAY_NAMES[t] ?? t}</button>
                    ))}
                  </div>
                ))
              ) : (
                CHORD_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="pattern-group-label">{group.label}</div>
                    {group.types.map(t => (
                      <button key={t}
                        className={`pattern-item${patternType === t ? ' active' : ''}`}
                        onClick={() => { setPatternType(t); setDropdownOpen(false) }}
                      >{t}</button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Root note picker ─────────────────────────────────── */}
      <div className="root-picker">
        {PC_FROM_A.map(pc => (
          <button key={pc}
            className={`root-btn${root === pc ? ' active' : ''}`}
            onClick={() => setRoot(pc)}
          >{ROOT_NAMES[pc]}</button>
        ))}
      </div>

      {/* ── Scale / chord info ───────────────────────────────── */}
      <div className="scale-info">
        <span className="scale-title">{patternLabel}</span>
        <span className="scale-notes-text">{noteList}</span>
        {mode === 'scales' && SCALE_DESCRIPTIONS[patternType] && (
          <span className="scale-description">{SCALE_DESCRIPTIONS[patternType]}</span>
        )}
        <div className="scale-legend">
          <span className="legend-item">
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#4ade80" /></svg>
            Root
          </span>
          <span className="legend-item">
            <svg width="14" height="14">
              <circle cx="7" cy="7" r="6"
                fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
            </svg>
            {mode === 'chords' ? 'Chord tone' : 'Scale note'}
          </span>
          {mode === 'chords' && (
            <label className="chord-mode-label">
              <span className="labels-toggle-text">Chord mode</span>
              <div className={`toggle-track${chordMode ? ' on' : ''}`}
                onClick={() => setChordMode(v => !v)}>
                <div className="toggle-knob" />
              </div>
            </label>
          )}
        </div>
      </div>

      {/* ── Guitar fretboard ─────────────────────────────────── */}
      {instrument === 'guitar' && (
        <Fretboard onPress={press} getNoteDisplay={getNoteDisplay} showLabels />
      )}

      {/* ── Piano ────────────────────────────────────────────── */}
      {instrument === 'piano' && (
        <>
          <div className="sp-controls">
            <label className="labels-toggle">
              <span className="labels-toggle-text">Note labels</span>
              <div className={`toggle-track${showLabels ? ' on' : ''}`}
                onClick={() => setShowLabels(v => !v)}>
                <div className="toggle-knob" />
              </div>
            </label>
          </div>

          <div className="piano-wrap">
            <div className="piano-scroll" ref={pianoScrollRef}>
              <div className="piano-spacer" />
              <Piano onPress={press} getKeyClass={getKeyClass} showLabels={showLabels} />
              <div className="piano-spacer" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
