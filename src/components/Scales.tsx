import { useState, useRef, useEffect } from 'react'
import './Scales.css'

// ── Note data ─────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const IS_BLACK   = [false, true, false, true, false, false, true, false, true, false, true, false]

// ── Pattern intervals ─────────────────────────────────────────
const SCALE_INTERVALS: Record<string, number[]> = {
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Minor': [0, 2, 3, 5, 7, 8, 10],
}
const CHORD_INTERVALS: Record<string, number[]> = {
  'Major': [0, 4, 7],
  'Minor': [0, 3, 7],
}

// ── Piano layout ──────────────────────────────────────────────
const WHITE_W = 36
const WHITE_H = 132
const BLACK_W = 22
const BLACK_H = 82

interface PKey { midi: number; note: string; octave: number; black: boolean; left: number }

function buildKeys(): PKey[] {
  const keys: PKey[] = []
  let wi = 0
  const wl: Record<number, number> = {}
  for (let midi = 21; midi <= 108; midi++) {
    const ni     = midi % 12
    const black  = IS_BLACK[ni]
    const note   = NOTE_NAMES[ni]
    const octave = Math.floor(midi / 12) - 1
    if (!black) {
      wl[midi] = wi * WHITE_W
      keys.push({ midi, note, octave, black, left: wi++ * WHITE_W })
    } else {
      keys.push({ midi, note, octave, black, left: wl[midi - 1] + WHITE_W - BLACK_W / 2 })
    }
  }
  return keys
}

const KEYS     = buildKeys()
const PIANO_W  = 52 * WHITE_W
const MIDDLE_C = KEYS.find(k => k.midi === 60)!

// ── Fretboard layout ──────────────────────────────────────────
// Top of fretboard = high E, bottom = low E (player's view)
const OPEN_STRINGS = [64, 59, 55, 50, 45, 40]  // E4 B3 G3 D3 A2 E2
const NUM_FRETS    = 12
const MARKER_FRETS = new Set([3, 5, 7, 9, 12])

const TOP_PAD  = 30
const BOT_PAD  = 20
const LEFT_PAD = 32
const NUT_X    = LEFT_PAD
const NUT_W    = 4
const FRET_W   = 44
const STRING_H = 30
const CIRCLE_R = 11

const NUM_STRINGS = OPEN_STRINGS.length
const FB_W = NUT_X + NUT_W + NUM_FRETS * FRET_W + 16
const FB_H = TOP_PAD + (NUM_STRINGS - 1) * STRING_H + BOT_PAD

function fretX(fret: number): number {
  return fret === 0
    ? NUT_X - CIRCLE_R - 3
    : NUT_X + NUT_W + (fret - 0.5) * FRET_W
}

function strY(si: number): number {
  return TOP_PAD + si * STRING_H
}

// ── Audio synthesis ───────────────────────────────────────────
function playNote(midi: number, ctx: AudioContext) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12)
  const now  = ctx.currentTime
  const dur  = 1.8 + (108 - midi) / 87 * 1.5

  const master = ctx.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(0.45, now + 0.008)
  master.gain.exponentialRampToValueAtTime(0.25, now + 0.12)
  master.gain.exponentialRampToValueAtTime(0.001, now + dur)
  master.connect(ctx.destination)

  ;[1, 2, 3, 4, 6].forEach((p, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq * p
    const g = ctx.createGain()
    g.gain.value = [0.5, 0.25, 0.12, 0.06, 0.02][i]
    osc.connect(g)
    g.connect(master)
    osc.start(now)
    osc.stop(now + dur + 0.05)
  })
}

// ── Component ─────────────────────────────────────────────────
type Mode       = 'scales' | 'chords'
type Instrument = 'guitar' | 'piano'

export default function Scales() {
  const [mode, setMode]             = useState<Mode>('scales')
  const [instrument, setInstrument] = useState<Instrument>('guitar')
  const [root, setRoot]             = useState(4)          // E
  const [patternType, setPatternType] = useState('Major')
  const [showLabels, setShowLabels] = useState(true)

  const audioCtxRef    = useRef<AudioContext | null>(null)
  const pianoScrollRef = useRef<HTMLDivElement>(null)

  const intervals  = (mode === 'scales' ? SCALE_INTERVALS : CHORD_INTERVALS)[patternType]
  const noteSet    = new Set(intervals.map(i => (root + i) % 12))
  const noteList   = intervals.map(i => NOTE_NAMES[(root + i) % 12]).join(' – ')
  const patternLabel = `${NOTE_NAMES[root]} ${patternType} ${mode === 'chords' ? 'Chord' : 'Scale'}`

  // Scroll piano to middle C when switching to piano view
  // +24 accounts for the left spacer inside piano-scroll
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
    ctx.state === 'suspended' ? ctx.resume().then(() => playNote(midi, ctx)) : playNote(midi, ctx)
  }

  return (
    <div className="scales">

      {/* ── Top selectors row ───────────────────────────────── */}
      <div className="selectors-row">
        <div className="seg-control">
          {(['scales', 'chords'] as Mode[]).map(m => (
            <button key={m}
              className={`seg-btn${mode === m ? ' active' : ''}`}
              onClick={() => setMode(m)}
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

      {/* ── Pattern type (Major / Minor) ─────────────────────── */}
      <div className="scale-type-row">
        {Object.keys(mode === 'scales' ? SCALE_INTERVALS : CHORD_INTERVALS).map(t => (
          <button key={t}
            className={`scale-type-btn${patternType === t ? ' active' : ''}`}
            onClick={() => setPatternType(t)}
          >{t}</button>
        ))}
      </div>

      {/* ── Root note picker ─────────────────────────────────── */}
      <div className="root-picker">
        {NOTE_NAMES.map((note, i) => (
          <button key={i}
            className={`root-btn${root === i ? ' active' : ''}`}
            onClick={() => setRoot(i)}
          >{note}</button>
        ))}
      </div>

      {/* ── Scale / chord info ───────────────────────────────── */}
      <div className="scale-info">
        <span className="scale-title">{patternLabel}</span>
        <span className="scale-notes-text">{noteList}</span>
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
        </div>
      </div>

      {/* ── Guitar fretboard ─────────────────────────────────── */}
      {instrument === 'guitar' && (
        <>
          <div className="fretboard-scroll">
            <svg viewBox={`0 0 ${FB_W} ${FB_H}`} width={FB_W} height={FB_H}>

              {/* Fretboard body */}
              <rect x={NUT_X} y={TOP_PAD - 6}
                width={NUT_W + NUM_FRETS * FRET_W}
                height={(NUM_STRINGS - 1) * STRING_H + 12}
                fill="rgba(255,255,255,0.025)" rx="2" />

              {/* Position marker dots */}
              {Array.from(MARKER_FRETS).sort((a, b) => a - b).map(fret => {
                const cx  = fretX(fret)
                const mid = strY(0) + ((NUM_STRINGS - 1) * STRING_H) / 2
                return fret === 12 ? (
                  <g key={fret}>
                    <circle cx={cx} cy={strY(1)} r="4.5" fill="rgba(255,255,255,0.1)" />
                    <circle cx={cx} cy={strY(NUM_STRINGS - 2)} r="4.5" fill="rgba(255,255,255,0.1)" />
                  </g>
                ) : (
                  <circle key={fret} cx={cx} cy={mid} r="4.5" fill="rgba(255,255,255,0.1)" />
                )
              })}

              {/* Fret number labels */}
              {Array.from({ length: NUM_FRETS }, (_, i) => i + 1).map(fret => (
                <text key={fret}
                  x={fretX(fret)} y={TOP_PAD - 10}
                  textAnchor="middle" fontSize="9"
                  fill={MARKER_FRETS.has(fret) ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'}
                  style={{ userSelect: 'none' }}
                >{fret}</text>
              ))}

              {/* String lines */}
              {OPEN_STRINGS.map((_, si) => (
                <line key={si}
                  x1={NUT_X} y1={strY(si)} x2={FB_W - 8} y2={strY(si)}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={0.8 + si * 0.32}
                />
              ))}

              {/* Nut */}
              <rect x={NUT_X} y={TOP_PAD - 6}
                width={NUT_W} height={(NUM_STRINGS - 1) * STRING_H + 12}
                fill="rgba(255,255,255,0.6)" rx="1" />

              {/* Fret lines */}
              {Array.from({ length: NUM_FRETS }, (_, fi) => (
                <line key={fi}
                  x1={NUT_X + NUT_W + (fi + 1) * FRET_W} y1={TOP_PAD - 4}
                  x2={NUT_X + NUT_W + (fi + 1) * FRET_W} y2={TOP_PAD + (NUM_STRINGS - 1) * STRING_H + 4}
                  stroke="rgba(255,255,255,0.18)" strokeWidth="1"
                />
              ))}

              {/* Note circles — visual only */}
              {OPEN_STRINGS.map((openMidi, si) =>
                Array.from({ length: NUM_FRETS + 1 }, (_, fret) => {
                  const midi = openMidi + fret
                  const pc   = midi % 12
                  if (!noteSet.has(pc)) return null
                  const isRoot = pc === root
                  const cx = fretX(fret)
                  const cy = strY(si)
                  return (
                    <g key={fret}>
                      <circle cx={cx} cy={cy} r={CIRCLE_R}
                        fill={isRoot ? '#4ade80' : 'rgba(255,255,255,0.14)'}
                        stroke={isRoot ? 'rgba(74,222,128,0.7)' : 'rgba(255,255,255,0.45)'}
                        strokeWidth="1.5"
                      />
                      <text x={cx} y={cy + 4}
                        textAnchor="middle" fontSize="9" fontWeight="700"
                        fill={isRoot ? '#000' : '#fff'}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >{NOTE_NAMES[pc]}</text>
                    </g>
                  )
                })
              )}

              {/* Transparent hit areas — ALL string × fret positions playable */}
              {OPEN_STRINGS.map((openMidi, si) =>
                Array.from({ length: NUM_FRETS + 1 }, (_, fret) => {
                  const midi = openMidi + fret
                  const cy   = strY(si)
                  const x    = fret === 0
                    ? fretX(0) - CIRCLE_R - 2
                    : NUT_X + NUT_W + (fret - 1) * FRET_W
                  const w    = fret === 0 ? CIRCLE_R * 2 + 4 : FRET_W
                  return (
                    <rect key={fret}
                      x={x} y={cy - STRING_H / 2}
                      width={w} height={STRING_H}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onPointerDown={() => press(midi)}
                    />
                  )
                })
              )}
            </svg>
          </div>
          <div className="string-hint">High E · B · G · D · A · Low E &nbsp;·&nbsp; Standard tuning</div>
        </>
      )}

      {/* ── Piano ────────────────────────────────────────────── */}
      {instrument === 'piano' && (
        <>
          <div className="sp-controls">
            <label className="labels-toggle">
              <span className="labels-toggle-text">Note labels</span>
              <div className={`toggle-track${showLabels ? ' on' : ''}`}
                onClick={() => setShowLabels(v => !v)}
              >
                <div className="toggle-knob" />
              </div>
            </label>
          </div>

          <div className="piano-wrap">
          <div className="piano-scroll" ref={pianoScrollRef}>
            <div className="piano-spacer" />
            <div className="piano-keys" style={{ width: PIANO_W }}>
              {KEYS.filter(k => !k.black).map(k => {
                const pc      = k.midi % 12
                const isRoot  = pc === root
                const inScale = noteSet.has(pc)
                const cls     = isRoot ? ' lit-root' : inScale ? ' lit-scale' : ''
                return (
                  <div key={k.midi}
                    className={`pkey white${cls}`}
                    style={{ left: k.left, width: WHITE_W - 1, height: WHITE_H }}
                    onPointerDown={() => press(k.midi)}
                  >
                    {showLabels && (
                      <span className="key-label-white">{k.note}{k.octave}</span>
                    )}
                  </div>
                )
              })}
              {KEYS.filter(k => k.black).map(k => {
                const pc      = k.midi % 12
                const isRoot  = pc === root
                const inScale = noteSet.has(pc)
                const cls     = isRoot ? ' lit-root' : inScale ? ' lit-scale' : ''
                return (
                  <div key={k.midi}
                    className={`pkey black${cls}`}
                    style={{ left: k.left, width: BLACK_W, height: BLACK_H }}
                    onPointerDown={() => press(k.midi)}
                  >
                    {showLabels && (
                      <span className="key-label-black">{k.note}</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="piano-spacer" />
          </div>
          </div>
        </>
      )}
    </div>
  )
}
