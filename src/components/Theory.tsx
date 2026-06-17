import { useState, useRef, useEffect, useCallback } from 'react'
import './Theory.css'

// ── Piano key data ────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const IS_BLACK   = [false, true, false, true, false, false, true, false, true, false, true, false]

const WHITE_W = 36
const WHITE_H = 132
const BLACK_W = 22
const BLACK_H = 82

interface Key { midi: number; note: string; octave: number; black: boolean; left: number }

function buildKeys(): Key[] {
  const keys: Key[] = []
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

// ── Staff note maths ──────────────────────────────────────────────
const CHROMATIC_TO_DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const IS_SHARP_IDX = [false, true, false, true, false, false, true, false, true, false, true, false]
const LINE_SPACING  = 11
const HALF_SPACE    = LINE_SPACING / 2
const BOTTOM_LINE_Y = 60
const E4_DIATONIC   = 30

function noteStaffY(midi: number): number {
  const ni     = midi % 12
  const octave = Math.floor(midi / 12) - 1
  const steps  = (octave * 7 + CHROMATIC_TO_DIATONIC[ni]) - E4_DIATONIC
  return BOTTOM_LINE_Y - steps * HALF_SPACE
}

function ledgerLineYs(midi: number): number[] {
  const ni     = midi % 12
  const octave = Math.floor(midi / 12) - 1
  const steps  = (octave * 7 + CHROMATIC_TO_DIATONIC[ni]) - E4_DIATONIC
  const ys: number[] = []
  if (steps >= 10) {
    for (let s = 10; s <= steps; s += 2) ys.push(BOTTOM_LINE_Y - s * HALF_SPACE)
  }
  if (steps === -2 || steps === -3) {
    ys.push(BOTTOM_LINE_Y + 2 * HALF_SPACE)
  }
  if (steps <= -14) {
    for (let s = -14; s >= steps; s -= 2) ys.push(BOTTOM_LINE_Y - s * HALF_SPACE)
  }
  return ys
}

// ── Quiz note MIDI map — treble staff, no ledger lines needed ─────
// Each note mapped to a MIDI in E4–D#5 range (steps 0–8, no ledgers)
const QUIZ_MIDI: Record<string, number> = {
  'C': 72, 'C#': 73, 'D': 74, 'D#': 75,
  'E': 64, 'F': 65, 'F#': 66, 'G': 67,
  'G#': 68, 'A': 69, 'A#': 70, 'B': 71,
}

// ── Piano sound synthesis ─────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────
type TheoryTab = 'learn' | 'quiz'

function pickRandom(notes: string[], exclude?: string): string {
  if (notes.length === 1) return notes[0]
  const pool = notes.filter(n => n !== exclude)
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function Theory() {
  // ── Shared
  const [theoryTab, setTheoryTab] = useState<TheoryTab>('learn')
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => () => { audioCtxRef.current?.close() }, [])

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }

  function pressAudio(midi: number) {
    const ctx = getAudioCtx()
    const go = () => playNote(midi, ctx)
    ctx.state === 'suspended' ? ctx.resume().then(go) : go()
  }

  // ── Learn tab state
  const [active, setActive]         = useState<Key | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const learnScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (theoryTab !== 'learn') return
    const el = learnScrollRef.current
    if (!el) return
    el.scrollLeft = MIDDLE_C.left - el.clientWidth / 2 + WHITE_W / 2
  }, [theoryTab])

  function pressKey(k: Key) {
    setActive(k)
    pressAudio(k.midi)
  }

  // ── Quiz tab state
  const ALL_NOTES = NOTE_NAMES
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set(ALL_NOTES))
  const [quizStarted, setQuizStarted]     = useState(false)
  const [quizNote, setQuizNote]           = useState<string | null>(null)
  const [score, setScore]                 = useState({ correct: 0, total: 0 })
  const [highlightMidis, setHighlightMidis] = useState<Set<number>>(new Set())
  const [feedback, setFeedback]           = useState<'prompt' | 'wrong'>('prompt')
  const firstAttemptRef                   = useRef(true)
  const quizScrollRef                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (theoryTab !== 'quiz') return
    const el = quizScrollRef.current
    if (!el) return
    el.scrollLeft = MIDDLE_C.left - el.clientWidth / 2 + WHITE_W / 2
  }, [theoryTab])

  function toggleNote(note: string) {
    setSelectedNotes(prev => {
      if (prev.has(note) && prev.size === 1) return prev
      const next = new Set(prev)
      next.has(note) ? next.delete(note) : next.add(note)
      return next
    })
  }

  function startQuiz() {
    const noteList = Array.from(selectedNotes)
    const first = pickRandom(noteList)
    setQuizNote(first)
    setScore({ correct: 0, total: 0 })
    setHighlightMidis(new Set())
    setFeedback('prompt')
    firstAttemptRef.current = true
    setQuizStarted(true)
  }

  const pressQuizKey = useCallback((k: Key) => {
    if (!quizNote) return
    pressAudio(k.midi)

    const pressedPc = k.midi % 12
    const correctPc = NOTE_NAMES.indexOf(quizNote)

    if (pressedPc === correctPc) {
      // Correct
      setScore(prev => ({
        correct: prev.correct + (firstAttemptRef.current ? 1 : 0),
        total: prev.total + 1,
      }))
      const noteList = Array.from(selectedNotes)
      const next = pickRandom(noteList, quizNote)
      setQuizNote(next)
      setHighlightMidis(new Set())
      setFeedback('prompt')
      firstAttemptRef.current = true
    } else {
      // Wrong — highlight visible correct keys
      firstAttemptRef.current = false
      const el = quizScrollRef.current
      if (el) {
        const scrollLeft  = el.scrollLeft
        const viewWidth   = el.clientWidth
        const visible = KEYS.filter(k2 => {
          if (k2.midi % 12 !== correctPc) return false
          const keyRight = k2.left + (k2.black ? BLACK_W : WHITE_W)
          return keyRight > scrollLeft && k2.left < scrollLeft + viewWidth
        })
        setHighlightMidis(new Set(visible.map(k2 => k2.midi)))
      } else {
        // fallback: highlight all correct-pitch keys
        setHighlightMidis(new Set(
          KEYS.filter(k2 => k2.midi % 12 === correctPc).map(k2 => k2.midi)
        ))
      }
      setFeedback('wrong')
    }
  }, [quizNote, selectedNotes])

  // ── Learn tab note display
  const NOTE_X = 155
  const ny     = active ? noteStaffY(active.midi) : null
  const lYs    = active ? ledgerLineYs(active.midi) : []
  const sharp  = active ? IS_SHARP_IDX[active.midi % 12] : false

  // ── Quiz note display
  const quizMidi = quizNote ? QUIZ_MIDI[quizNote] : null
  const qny      = quizMidi !== null ? noteStaffY(quizMidi) : null
  const qlYs     = quizMidi !== null ? ledgerLineYs(quizMidi) : []
  const qsharp   = quizNote ? IS_SHARP_IDX[NOTE_NAMES.indexOf(quizNote)] : false

  return (
    <div className="theory">

      {/* ── Sub-tab switcher ──────────────────────────────────── */}
      <div className="theory-tabs">
        <button
          className={`theory-tab-btn${theoryTab === 'learn' ? ' active' : ''}`}
          onClick={() => setTheoryTab('learn')}
        >Learn</button>
        <button
          className={`theory-tab-btn${theoryTab === 'quiz' ? ' active' : ''}`}
          onClick={() => setTheoryTab('quiz')}
        >Quiz</button>
      </div>

      {/* ════════════════════════════════════════════════════════
          LEARN TAB
      ════════════════════════════════════════════════════════ */}
      {theoryTab === 'learn' && (
        <>
          <div className="sheet-area">
            <svg viewBox="0 -8 300 150" className="staff-svg" preserveAspectRatio="xMidYMid meet">
              <line x1="38" y1="16" x2="38" y2="126"
                stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />

              {[0,1,2,3,4].map(i => (
                <line key={`t${i}`}
                  x1="38" y1={16 + i * LINE_SPACING}
                  x2="294" y2={16 + i * LINE_SPACING}
                  stroke="rgba(255,255,255,0.4)" strokeWidth="1"
                />
              ))}
              <text x="40" y="62" fontSize="56" fill="rgba(255,255,255,0.65)"
                fontFamily="'Times New Roman', Georgia, serif"
                style={{ userSelect: 'none' }}>𝄞</text>

              {[0,1,2,3,4].map(i => (
                <line key={`b${i}`}
                  x1="38" y1={82 + i * LINE_SPACING}
                  x2="294" y2={82 + i * LINE_SPACING}
                  stroke="rgba(255,255,255,0.4)" strokeWidth="1"
                />
              ))}
              <text x="40" y="110" fontSize="38" fill="rgba(255,255,255,0.65)"
                fontFamily="'Times New Roman', Georgia, serif"
                style={{ userSelect: 'none' }}>𝄢</text>

              {ny !== null && (
                <g>
                  {lYs.map((ly, i) => (
                    <line key={i}
                      x1={NOTE_X - 13} y1={ly} x2={NOTE_X + 13} y2={ly}
                      stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"
                    />
                  ))}
                  {sharp && (
                    <text x={NOTE_X - 14} y={ny + 4}
                      fontSize="13" fill="#4ade80"
                      fontFamily="'Times New Roman', Georgia, serif"
                      textAnchor="middle">♯</text>
                  )}
                  <ellipse cx={NOTE_X} cy={ny} rx="7.5" ry="5.5" fill="#4ade80" />
                </g>
              )}
            </svg>

            <div className="note-readout">
              {active ? (
                <>
                  <span className="readout-name">{active.note}</span>
                  <span className="readout-oct">{active.octave}</span>
                </>
              ) : (
                <span className="readout-hint">press any key</span>
              )}
            </div>
          </div>

          <div className="theory-controls">
            <label className="labels-toggle">
              <span className="labels-toggle-text">Note labels</span>
              <div
                className={`toggle-track${showLabels ? ' on' : ''}`}
                onClick={() => setShowLabels(v => !v)}
              >
                <div className="toggle-knob" />
              </div>
            </label>
          </div>

          <div className="piano-scroll" ref={learnScrollRef}>
            <div className="piano-keys" style={{ width: PIANO_W }}>
              {KEYS.filter(k => !k.black).map(k => (
                <div key={k.midi}
                  className={`pkey white${active?.midi === k.midi ? ' lit' : ''}`}
                  style={{ left: k.left, width: WHITE_W - 1, height: WHITE_H }}
                  onPointerDown={() => pressKey(k)}
                >
                  {showLabels && <span className="key-label-white">{k.note}{k.octave}</span>}
                </div>
              ))}
              {KEYS.filter(k => k.black).map(k => (
                <div key={k.midi}
                  className={`pkey black${active?.midi === k.midi ? ' lit' : ''}`}
                  style={{ left: k.left, width: BLACK_W, height: BLACK_H }}
                  onPointerDown={() => pressKey(k)}
                >
                  {showLabels && <span className="key-label-black">{k.note}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          QUIZ TAB
      ════════════════════════════════════════════════════════ */}
      {theoryTab === 'quiz' && (
        <div className="quiz-layout">

          {/* Note selector */}
          <div className="quiz-note-picker">
            {ALL_NOTES.map(note => (
              <button key={note}
                className={`quiz-note-btn${selectedNotes.has(note) ? ' active' : ''}`}
                onClick={() => toggleNote(note)}
              >{note}</button>
            ))}
          </div>

          {/* Treble staff showing quiz note */}
          <div className="quiz-staff-area">
            <svg viewBox="0 -8 300 80" className="quiz-staff-svg" preserveAspectRatio="xMidYMid meet">
              <line x1="38" y1="16" x2="38" y2="60"
                stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
              {[0,1,2,3,4].map(i => (
                <line key={i}
                  x1="38" y1={16 + i * LINE_SPACING}
                  x2="294" y2={16 + i * LINE_SPACING}
                  stroke="rgba(255,255,255,0.4)" strokeWidth="1"
                />
              ))}
              <text x="40" y="62" fontSize="56" fill="rgba(255,255,255,0.65)"
                fontFamily="'Times New Roman', Georgia, serif"
                style={{ userSelect: 'none' }}>𝄞</text>

              {qny !== null && quizStarted && (
                <g>
                  {qlYs.map((ly, i) => (
                    <line key={i}
                      x1={NOTE_X - 13} y1={ly} x2={NOTE_X + 13} y2={ly}
                      stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"
                    />
                  ))}
                  {qsharp && (
                    <text x={NOTE_X - 14} y={qny + 4}
                      fontSize="13" fill="#4ade80"
                      fontFamily="'Times New Roman', Georgia, serif"
                      textAnchor="middle">♯</text>
                  )}
                  <ellipse cx={NOTE_X} cy={qny} rx="7.5" ry="5.5" fill="#4ade80" />
                </g>
              )}
            </svg>
          </div>

          {/* Score + feedback row */}
          <div className="quiz-info-row">
            <span className="quiz-score">{score.correct} / {score.total}</span>
            <span className={`quiz-feedback${feedback === 'wrong' ? ' wrong' : ''}`}>
              {!quizStarted
                ? 'Select notes and start'
                : feedback === 'wrong'
                  ? '✗ Correct answer highlighted below'
                  : 'Which note is this?'}
            </span>
            <button className="quiz-start-btn" onClick={startQuiz}>
              {quizStarted ? 'Restart' : 'Start'}
            </button>
          </div>

          {/* Piano — no labels in quiz mode */}
          <div className="piano-scroll quiz-piano-scroll" ref={quizScrollRef}>
            <div className="piano-keys" style={{ width: PIANO_W }}>
              {KEYS.filter(k => !k.black).map(k => {
                const isCorrect = highlightMidis.has(k.midi)
                return (
                  <div key={k.midi}
                    className={`pkey white${isCorrect ? ' quiz-correct' : ''}`}
                    style={{ left: k.left, width: WHITE_W - 1, height: WHITE_H }}
                    onPointerDown={() => pressQuizKey(k)}
                  />
                )
              })}
              {KEYS.filter(k => k.black).map(k => {
                const isCorrect = highlightMidis.has(k.midi)
                return (
                  <div key={k.midi}
                    className={`pkey black${isCorrect ? ' quiz-correct' : ''}`}
                    style={{ left: k.left, width: BLACK_W, height: BLACK_H }}
                    onPointerDown={() => pressQuizKey(k)}
                  />
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
