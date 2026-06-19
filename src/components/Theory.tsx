import { useState, useRef, useEffect, useCallback } from 'react'
import { IS_BLACK, KEYS, MIDDLE_C, WHITE_W, playNote, Key, ROOT_NAMES_FROM_A, ROOT_NAME_TO_PC } from '../music'
import Piano from './Piano'
import Fretboard, { NoteStyle } from './Fretboard'
import './Theory.css'

// ── Staff note maths ──────────────────────────────────────────────
// Sharp enharmonic: black keys sit on the line/space of the note BELOW
const CHROMATIC_TO_DIATONIC      = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
// Flat enharmonic: black keys sit on the line/space of the note ABOVE
const CHROMATIC_TO_DIATONIC_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]

const LINE_SPACING  = 11
const HALF_SPACE    = LINE_SPACING / 2
const BOTTOM_LINE_Y = 60
const E4_DIATONIC   = 30
// Extra gap inserted between treble and bass staves so clef glyphs never
// overlap even when the system font renders them larger than expected.
const BASS_OFFSET   = 28

function noteStaffY(midi: number, flat = false): number {
  const ni    = midi % 12
  const oct   = Math.floor(midi / 12) - 1
  const tbl   = flat ? CHROMATIC_TO_DIATONIC_FLAT : CHROMATIC_TO_DIATONIC
  const steps = (oct * 7 + tbl[ni]) - E4_DIATONIC
  const y     = BOTTOM_LINE_Y - steps * HALF_SPACE
  return steps <= -4 ? y + BASS_OFFSET : y
}

function ledgerLineYs(midi: number, flat = false): number[] {
  const ni    = midi % 12
  const oct   = Math.floor(midi / 12) - 1
  const tbl   = flat ? CHROMATIC_TO_DIATONIC_FLAT : CHROMATIC_TO_DIATONIC
  const steps = (oct * 7 + tbl[ni]) - E4_DIATONIC
  const ys: number[] = []
  if (steps >= 10) {
    for (let s = 10; s <= steps; s += 2) ys.push(BOTTOM_LINE_Y - s * HALF_SPACE)
  }
  if (steps === -2 || steps === -3) {
    ys.push(BOTTOM_LINE_Y + 2 * HALF_SPACE)
  }
  if (steps <= -14) {
    for (let s = -14; s >= steps; s -= 2)
      ys.push(BOTTOM_LINE_Y - s * HALF_SPACE + BASS_OFFSET)
  }
  return ys
}

// ── Quiz note MIDI map — treble staff, no ledger lines ────────────
// Ordered A→Ab, uses common enharmonic names (Bb not A#, etc.)
const QUIZ_MIDI: Record<string, number> = {
  'A': 69, 'Bb': 70, 'B': 71,
  'C': 72, 'Db': 73, 'D': 74, 'Eb': 75,
  'E': 64, 'F': 65, 'F#': 66, 'G': 67, 'Ab': 68,
}

// ── Component ─────────────────────────────────────────────────────
type TheoryTab  = 'learn' | 'quiz'
type Instrument = 'piano' | 'guitar'

function pickRandom(notes: string[], exclude?: string): string {
  if (notes.length === 1) return notes[0]
  const pool = notes.filter(n => n !== exclude)
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function Theory() {
  // ── Shared state ──────────────────────────────────────────────
  const [theoryTab, setTheoryTab]   = useState<TheoryTab>('learn')
  const [instrument, setInstrument] = useState<Instrument>('piano')
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => () => { audioCtxRef.current?.close() }, [])

  function pressAudio(midi: number) {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current
    const go  = () => playNote(midi, ctx)
    ctx.state === 'suspended' ? ctx.resume().then(go) : go()
  }

  // ── Learn tab ─────────────────────────────────────────────────
  const [active, setActive]         = useState<Key | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const learnScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (theoryTab !== 'learn' || instrument !== 'piano') return
    const el = learnScrollRef.current
    if (el) el.scrollLeft = MIDDLE_C.left - el.clientWidth / 2 + WHITE_W / 2
  }, [theoryTab, instrument])

  function pressLearn(midi: number) {
    const key = KEYS.find(k => k.midi === midi)
    if (key) { setActive(key); pressAudio(midi) }
  }

  function getLearnKeyClass(midi: number): string {
    return active?.midi === midi ? ' lit' : ''
  }

  function getLearnNoteDisplay(midi: number): NoteStyle | null {
    if (active !== null && midi % 12 === active.midi % 12) {
      return { fill: '#4ade80', stroke: 'rgba(74,222,128,0.7)', labelFill: '#000' }
    }
    if (showLabels) {
      return {
        fill:      'rgba(255,255,255,0.06)',
        stroke:    'rgba(255,255,255,0.15)',
        labelFill: 'rgba(255,255,255,0.28)',
      }
    }
    return null
  }

  // ── Quiz tab ──────────────────────────────────────────────────
  const ALL_NOTES = ROOT_NAMES_FROM_A
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set(ALL_NOTES))
  const [quizStarted, setQuizStarted]     = useState(false)
  const [quizNote, setQuizNote]           = useState<string | null>(null)
  const [score, setScore]                 = useState({ correct: 0, total: 0 })
  const [highlightPc, setHighlightPc]     = useState<number | null>(null)
  const [feedback, setFeedback]           = useState<'prompt' | 'wrong'>('prompt')
  const firstAttemptRef                   = useRef(true)
  const quizScrollRef                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (theoryTab !== 'quiz' || instrument !== 'piano') return
    const el = quizScrollRef.current
    if (el) el.scrollLeft = MIDDLE_C.left - el.clientWidth / 2 + WHITE_W / 2
  }, [theoryTab, instrument])

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
    setQuizNote(pickRandom(noteList))
    setScore({ correct: 0, total: 0 })
    setHighlightPc(null)
    setFeedback('prompt')
    firstAttemptRef.current = true
    setQuizStarted(true)
  }

  const pressQuizKey = useCallback((midi: number) => {
    if (!quizNote) return
    pressAudio(midi)
    const pressedPc = midi % 12
    const correctPc = ROOT_NAME_TO_PC[quizNote] ?? -1
    if (pressedPc === correctPc) {
      setScore(prev => ({
        correct: prev.correct + (firstAttemptRef.current ? 1 : 0),
        total: prev.total + 1,
      }))
      const next = pickRandom(Array.from(selectedNotes), quizNote)
      setQuizNote(next)
      setHighlightPc(null)
      setFeedback('prompt')
      firstAttemptRef.current = true
    } else {
      firstAttemptRef.current = false
      setHighlightPc(correctPc)
      setFeedback('wrong')
    }
  }, [quizNote, selectedNotes])

  function getQuizKeyClass(midi: number): string {
    return highlightPc !== null && midi % 12 === highlightPc ? ' quiz-correct' : ''
  }

  function getQuizNoteDisplay(midi: number): NoteStyle | null {
    if (highlightPc === null || midi % 12 !== highlightPc) return null
    return { fill: '#4ade80', stroke: 'rgba(74,222,128,0.7)', labelFill: '#000' }
  }

  // ── Staff display values ──────────────────────────────────────
  const NOTE_X    = 155
  const ny        = active ? noteStaffY(active.midi) : null
  const lYs       = active ? ledgerLineYs(active.midi) : []
  const sharp     = active ? IS_BLACK[active.midi % 12] : false
  const quizMidi  = quizNote ? QUIZ_MIDI[quizNote] : null
  const qIsFlat   = quizNote ? quizNote.length > 1 && quizNote[1] === 'b' : false
  const qIsSharp  = quizNote ? quizNote.includes('#') : false
  const qny       = quizMidi !== null ? noteStaffY(quizMidi, qIsFlat) : null
  const qlYs      = quizMidi !== null ? ledgerLineYs(quizMidi, qIsFlat) : []

  return (
    <div className="theory">

      {/* ── Sub-tab switcher ───────────────────────────────────── */}
      <div className="theory-tabs">
        <button className={`theory-tab-btn${theoryTab === 'learn' ? ' active' : ''}`}
          onClick={() => setTheoryTab('learn')}>Learn</button>
        <button className={`theory-tab-btn${theoryTab === 'quiz' ? ' active' : ''}`}
          onClick={() => setTheoryTab('quiz')}>Quiz</button>
      </div>

      {/* ── Instrument switcher ────────────────────────────────── */}
      <div className="theory-instrument-row">
        <div className="seg-control">
          {(['piano', 'guitar'] as Instrument[]).map(inst => (
            <button key={inst}
              className={`seg-btn${instrument === inst ? ' active' : ''}`}
              onClick={() => setInstrument(inst)}
            >{inst === 'piano' ? 'Piano' : 'Guitar'}</button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          LEARN TAB
      ════════════════════════════════════════════════════════ */}
      {theoryTab === 'learn' && (
        <>
          {/* Grand staff */}
          <div className="sheet-area">
            <svg viewBox="0 -8 300 178" className="staff-svg" preserveAspectRatio="xMidYMid meet">
              <line x1="38" y1="16" x2="38" y2="154"
                stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
              {[0,1,2,3,4].map(i => (
                <line key={`t${i}`} x1="38" y1={16 + i * LINE_SPACING} x2="294" y2={16 + i * LINE_SPACING}
                  stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
              ))}
              <text x="40" y="60" fontSize="50" fill="rgba(255,255,255,0.65)"
                fontFamily="'Times New Roman', Georgia, serif" style={{ userSelect: 'none' }}>𝄞</text>
              {[0,1,2,3,4].map(i => (
                <line key={`b${i}`} x1="38" y1={110 + i * LINE_SPACING} x2="294" y2={110 + i * LINE_SPACING}
                  stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
              ))}
              <text x="40" y="136" fontSize="34" fill="rgba(255,255,255,0.65)"
                fontFamily="'Times New Roman', Georgia, serif" style={{ userSelect: 'none' }}>𝄢</text>
              {ny !== null && (
                <g>
                  {lYs.map((ly, i) => (
                    <line key={i} x1={NOTE_X - 13} y1={ly} x2={NOTE_X + 13} y2={ly}
                      stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
                  ))}
                  {sharp && (
                    <text x={NOTE_X - 14} y={ny + 4} fontSize="13" fill="#4ade80"
                      fontFamily="'Times New Roman', Georgia, serif" textAnchor="middle">♯</text>
                  )}
                  <ellipse cx={NOTE_X} cy={ny} rx="7.5" ry="5.5" fill="#4ade80" />
                </g>
              )}
            </svg>
            <div className="note-readout">
              {active ? (
                <><span className="readout-name">{active.note}</span>
                  <span className="readout-oct">{active.octave}</span></>
              ) : (
                <span className="readout-hint">press any key</span>
              )}
            </div>
          </div>

          {/* Controls — Note labels toggle (piano & guitar) */}
          <div className="theory-controls">
            <label className="labels-toggle">
              <span className="labels-toggle-text">Note labels</span>
              <div className={`toggle-track${showLabels ? ' on' : ''}`}
                onClick={() => setShowLabels(v => !v)}>
                <div className="toggle-knob" />
              </div>
            </label>
          </div>

          {/* Piano */}
          {instrument === 'piano' && (
            <div className="theory-piano-wrap">
              <div className="piano-scroll" ref={learnScrollRef}>
                <div className="piano-spacer" />
                <Piano onPress={pressLearn} getKeyClass={getLearnKeyClass} showLabels={showLabels} />
                <div className="piano-spacer" />
              </div>
            </div>
          )}

          {/* Guitar fretboard */}
          {instrument === 'guitar' && (
            <Fretboard onPress={pressLearn} getNoteDisplay={getLearnNoteDisplay} showLabels={showLabels} />
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          QUIZ TAB
      ════════════════════════════════════════════════════════ */}
      {theoryTab === 'quiz' && (
        <div className="quiz-layout">

          <div className="quiz-note-picker">
            {ALL_NOTES.map(note => (
              <button key={note}
                className={`quiz-note-btn${selectedNotes.has(note) ? ' active' : ''}`}
                onClick={() => toggleNote(note)}>{note}</button>
            ))}
          </div>

          <div className="quiz-staff-area">
            <svg viewBox="0 -8 300 80" className="quiz-staff-svg" preserveAspectRatio="xMidYMid meet">
              <line x1="38" y1="16" x2="38" y2="60"
                stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
              {[0,1,2,3,4].map(i => (
                <line key={i} x1="38" y1={16 + i * LINE_SPACING} x2="294" y2={16 + i * LINE_SPACING}
                  stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
              ))}
              <text x="40" y="62" fontSize="56" fill="rgba(255,255,255,0.65)"
                fontFamily="'Times New Roman', Georgia, serif" style={{ userSelect: 'none' }}>𝄞</text>
              {qny !== null && quizStarted && (
                <g>
                  {qlYs.map((ly, i) => (
                    <line key={i} x1={NOTE_X - 13} y1={ly} x2={NOTE_X + 13} y2={ly}
                      stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
                  ))}
                  {qIsSharp && (
                    <text x={NOTE_X - 14} y={qny + 4} fontSize="13" fill="#4ade80"
                      fontFamily="'Times New Roman', Georgia, serif" textAnchor="middle">♯</text>
                  )}
                  {qIsFlat && (
                    <text x={NOTE_X - 14} y={qny + 5} fontSize="15" fill="#4ade80"
                      fontFamily="'Times New Roman', Georgia, serif" textAnchor="middle">♭</text>
                  )}
                  <ellipse cx={NOTE_X} cy={qny} rx="7.5" ry="5.5" fill="#4ade80" />
                </g>
              )}
            </svg>
          </div>

          <div className="quiz-info-row">
            <span className="quiz-score">{score.correct} / {score.total}</span>
            <span className={`quiz-feedback${feedback === 'wrong' ? ' wrong' : ''}`}>
              {!quizStarted
                ? 'Select notes and start'
                : feedback === 'wrong'
                  ? '✗ Correct answer highlighted'
                  : 'Which note is this?'}
            </span>
            <button className="quiz-start-btn" onClick={startQuiz}>
              {quizStarted ? 'Restart' : 'Start'}
            </button>
          </div>

          {/* Quiz piano */}
          {instrument === 'piano' && (
            <div className="theory-piano-wrap">
              <div className="piano-scroll" ref={quizScrollRef}>
                <div className="piano-spacer" />
                <Piano onPress={pressQuizKey} getKeyClass={getQuizKeyClass} showLabels={false} />
                <div className="piano-spacer" />
              </div>
            </div>
          )}

          {/* Quiz guitar fretboard */}
          {instrument === 'guitar' && (
            <Fretboard onPress={pressQuizKey} getNoteDisplay={getQuizNoteDisplay} showLabels />
          )}

        </div>
      )}
    </div>
  )
}
