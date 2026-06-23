import { useState, useRef, useEffect, useCallback } from 'react'
import { IS_BLACK, KEYS, MIDDLE_C, WHITE_W, NOTE_NAMES, playNote, Key, ROOT_NAMES_FROM_A, ROOT_NAME_TO_PC } from '../music'
import Piano from './Piano'
import Fretboard, { NoteStyle } from './Fretboard'
import { SCALE_INTERVALS, CHORD_INTERVALS, SCALE_DISPLAY_NAMES } from './Scales'
import './Theory.css'

// ── Staff note maths ──────────────────────────────────────────────
const CHROMATIC_TO_DIATONIC      = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const CHROMATIC_TO_DIATONIC_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]

const LINE_SPACING  = 11
const HALF_SPACE    = LINE_SPACING / 2
const BOTTOM_LINE_Y = 60
const E4_DIATONIC   = 30
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

const QUIZ_MIDI: Record<string, number> = {
  'A': 69, 'Bb': 70, 'B': 71,
  'C': 72, 'Db': 73, 'D': 74, 'Eb': 75,
  'E': 64, 'F': 65, 'F#': 66, 'G': 67, 'Ab': 68,
}

// ── Roman numeral data ────────────────────────────────────────────
// Flat-friendly note names indexed by pitch class (0=C … 11=B)
const RN_NOTE = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']

interface RnChord { roman: string; type: 'Major' | 'Minor' | 'Diminished'; semitone: number }

const MAJOR_DEGREES: RnChord[] = [
  { roman: 'I',    type: 'Major',      semitone: 0  },
  { roman: 'ii',   type: 'Minor',      semitone: 2  },
  { roman: 'iii',  type: 'Minor',      semitone: 4  },
  { roman: 'IV',   type: 'Major',      semitone: 5  },
  { roman: 'V',    type: 'Major',      semitone: 7  },
  { roman: 'vi',   type: 'Minor',      semitone: 9  },
  { roman: 'vii°', type: 'Diminished', semitone: 11 },
]

const MINOR_DEGREES: RnChord[] = [
  { roman: 'i',    type: 'Minor',      semitone: 0  },
  { roman: 'ii°',  type: 'Diminished', semitone: 2  },
  { roman: 'III',  type: 'Major',      semitone: 3  },
  { roman: 'iv',   type: 'Minor',      semitone: 5  },
  { roman: 'v',    type: 'Minor',      semitone: 7  },
  { roman: 'VI',   type: 'Major',      semitone: 8  },
  { roman: 'VII',  type: 'Major',      semitone: 10 },
]

// ── Ear training helpers ──────────────────────────────────────────
type EtMode = 'note' | 'scale' | 'chord'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Component ─────────────────────────────────────────────────────
type TheorySection = 'notes' | 'ear' | 'roman'
type TheoryTab     = 'learn' | 'quiz'
type EtTab         = 'learn' | 'quiz'
type Instrument    = 'piano' | 'guitar'

function pickRandom(notes: string[], exclude?: string): string {
  if (notes.length === 1) return notes[0]
  const pool = notes.filter(n => n !== exclude)
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function Theory() {
  // ── Shared ────────────────────────────────────────────────────
  const [section, setSection]       = useState<TheorySection>('notes')
  const [theoryTab, setTheoryTab]   = useState<TheoryTab>('learn')
  const [instrument, setInstrument] = useState<Instrument>('piano')
  const audioCtxRef = useRef<AudioContext | null>(null)

  // ── ET sub-tab ────────────────────────────────────────────────
  const [etTab, setEtTab] = useState<EtTab>('learn')

  // ── Roman numeral state ───────────────────────────────────────
  const [rnKey, setRnKey]         = useState('C')
  const [rnScaleMode, setRnScaleMode] = useState<'major' | 'minor'>('major')
  const [rnActive, setRnActive]   = useState<number | null>(null)
  const rnTimeoutRef              = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── ET Learn state ────────────────────────────────────────────
  const [etLearnMode, setEtLearnMode] = useState<'scale' | 'chord'>('scale')
  const [etLearnRoot, setEtLearnRoot] = useState('C')
  const [etLearnType, setEtLearnType] = useState('Major')

  // ── ET Quiz state ─────────────────────────────────────────────
  const [etMode, setEtMode]           = useState<EtMode>('note')
  const [etNotePool, setEtNotePool]   = useState<Set<string>>(new Set(ROOT_NAMES_FROM_A))
  const [etScalePool, setEtScalePool] = useState<Set<string>>(new Set(Object.keys(SCALE_INTERVALS)))
  const [etChordPool, setEtChordPool] = useState<Set<string>>(new Set(Object.keys(CHORD_INTERVALS)))
  const [etRootMidi, setEtRootMidi]   = useState<number | null>(null)
  const [etAnswer, setEtAnswer]       = useState<string | null>(null)
  const [etChoices, setEtChoices]     = useState<string[]>([])
  const [etScore, setEtScore]         = useState({ correct: 0, total: 0 })
  const [etRevealed, setEtRevealed]   = useState(false)
  const [etWasCorrect, setEtWasCorrect] = useState(false)

  useEffect(() => () => { audioCtxRef.current?.close() }, [])

  function getCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }

  function pressAudio(midi: number) {
    const ctx = getCtx()
    const go  = () => playNote(midi, ctx)
    ctx.state === 'suspended' ? ctx.resume().then(go) : go()
  }

  // ── Sheet Music: Learn tab ────────────────────────────────────
  const [active, setActive]         = useState<Key | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const learnScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (theoryTab !== 'learn' || instrument !== 'piano') return
    const el = learnScrollRef.current
    if (!el) return
    el.scrollLeft = MIDDLE_C.left - el.clientWidth / 2 + WHITE_W / 2
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
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

  // ── Sheet Music: Quiz tab ─────────────────────────────────────
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
    if (!el) return
    el.scrollLeft = MIDDLE_C.left - el.clientWidth / 2 + WHITE_W / 2
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
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

  // ── ET Learn functions ────────────────────────────────────────
  function switchEtLearnMode(mode: 'scale' | 'chord') {
    setEtLearnMode(mode)
    const pool = mode === 'scale' ? SCALE_INTERVALS : CHORD_INTERVALS
    if (!pool[etLearnType]) setEtLearnType('Major')
  }

  function etLearnPlay() {
    const pc   = ROOT_NAME_TO_PC[etLearnRoot] ?? 0
    const midi = 48 + pc
    const ctx  = getCtx()
    const go   = () => {
      if (etLearnMode === 'scale') {
        const ivs = SCALE_INTERVALS[etLearnType] ?? []
        ivs.forEach((iv, i) => setTimeout(() => playNote(midi + iv, ctx), i * 250))
        setTimeout(() => playNote(midi + 12, ctx), ivs.length * 250)
      } else {
        const ivs = CHORD_INTERVALS[etLearnType] ?? []
        ivs.forEach((iv, i) => setTimeout(() => playNote(midi + iv, ctx), i * 25))
      }
    }
    ctx.state === 'suspended' ? ctx.resume().then(go) : go()
  }

  // ── ET Quiz functions ─────────────────────────────────────────
  function etPlayNoteQ(midi: number, ctx: AudioContext) {
    playNote(midi, ctx)
  }

  function etPlayScaleQ(rootMidi: number, scaleType: string, ctx: AudioContext) {
    const ivs = SCALE_INTERVALS[scaleType]
    ivs.forEach((iv, i) => setTimeout(() => playNote(rootMidi + iv, ctx), i * 200))
    setTimeout(() => playNote(rootMidi + 12, ctx), ivs.length * 200)
  }

  function etPlayChordQ(rootMidi: number, chordType: string, ctx: AudioContext) {
    CHORD_INTERVALS[chordType].forEach((iv, i) =>
      setTimeout(() => playNote(rootMidi + iv, ctx), i * 25)
    )
  }

  function etReplay() {
    if (etRootMidi === null || etAnswer === null) return
    const ctx = getCtx()
    const go = () => {
      if (etMode === 'note') etPlayNoteQ(etRootMidi!, ctx)
      else if (etMode === 'scale') etPlayScaleQ(etRootMidi!, etAnswer!, ctx)
      else etPlayChordQ(etRootMidi!, etAnswer!, ctx)
    }
    ctx.state === 'suspended' ? ctx.resume().then(go) : go()
  }

  function etPickChoices(correct: string, pool: string[]): string[] {
    if (pool.length <= 4) return shuffle(pool)
    const others = shuffle(pool.filter(t => t !== correct)).slice(0, 3)
    return shuffle([correct, ...others])
  }

  function etNext() {
    const noteArr = Array.from(etNotePool)
    if (noteArr.length === 0) return
    const ctx = getCtx()
    const noteName = noteArr[Math.floor(Math.random() * noteArr.length)]
    const pc = ROOT_NAME_TO_PC[noteName] ?? 0

    if (etMode === 'note') {
      const midi = 60 + pc
      const choices = etPickChoices(noteName, noteArr)
      setEtRootMidi(midi); setEtAnswer(noteName); setEtChoices(choices)
      setEtRevealed(false); setEtWasCorrect(false)
      const go = () => etPlayNoteQ(midi, ctx)
      ctx.state === 'suspended' ? ctx.resume().then(go) : go()
    } else if (etMode === 'scale') {
      const scaleArr = Array.from(etScalePool)
      if (scaleArr.length === 0) return
      const scaleType = scaleArr[Math.floor(Math.random() * scaleArr.length)]
      const midi = 48 + pc
      const choices = etPickChoices(scaleType, scaleArr)
      setEtRootMidi(midi); setEtAnswer(scaleType); setEtChoices(choices)
      setEtRevealed(false); setEtWasCorrect(false)
      const go = () => etPlayScaleQ(midi, scaleType, ctx)
      ctx.state === 'suspended' ? ctx.resume().then(go) : go()
    } else {
      const chordArr = Array.from(etChordPool)
      if (chordArr.length === 0) return
      const chordType = chordArr[Math.floor(Math.random() * chordArr.length)]
      const midi = 48 + pc
      const choices = etPickChoices(chordType, chordArr)
      setEtRootMidi(midi); setEtAnswer(chordType); setEtChoices(choices)
      setEtRevealed(false); setEtWasCorrect(false)
      const go = () => etPlayChordQ(midi, chordType, ctx)
      ctx.state === 'suspended' ? ctx.resume().then(go) : go()
    }
  }

  function etGuess(choice: string) {
    if (etRevealed || !etAnswer) return
    const correct = choice === etAnswer
    setEtWasCorrect(correct)
    setEtRevealed(true)
    setEtScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
  }

  function resetEt() {
    setEtRootMidi(null); setEtAnswer(null); setEtChoices([])
    setEtRevealed(false); setEtWasCorrect(false)
    setEtScore({ correct: 0, total: 0 })
  }

  function toggleEtNote(name: string) {
    setEtNotePool(prev => {
      if (prev.has(name) && prev.size === 1) return prev
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function toggleEtScale(type: string) {
    setEtScalePool(prev => {
      if (prev.has(type) && prev.size === 1) return prev
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  function toggleEtChord(type: string) {
    setEtChordPool(prev => {
      if (prev.has(type) && prev.size === 1) return prev
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  // ── Roman numeral functions ───────────────────────────────────
  function rnPlay(rootPc: number, type: string, idx: number) {
    const midi = 48 + rootPc
    const ctx  = getCtx()
    const go   = () => {
      CHORD_INTERVALS[type]?.forEach((iv, i) =>
        setTimeout(() => playNote(midi + iv, ctx), i * 25)
      )
    }
    ctx.state === 'suspended' ? ctx.resume().then(go) : go()
    setRnActive(idx)
    if (rnTimeoutRef.current) clearTimeout(rnTimeoutRef.current)
    rnTimeoutRef.current = setTimeout(() => setRnActive(null), 1400)
  }

  // ── ET Learn computed values ──────────────────────────────────
  const etLearnPc        = ROOT_NAME_TO_PC[etLearnRoot] ?? 0
  const etLearnIntervals = (etLearnMode === 'scale' ? SCALE_INTERVALS : CHORD_INTERVALS)[etLearnType] ?? []
  const etLearnNotes     = etLearnIntervals.map(iv => NOTE_NAMES[(etLearnPc + iv) % 12])
  const etLearnLabel     = `${etLearnRoot} ${SCALE_DISPLAY_NAMES[etLearnType] ?? etLearnType}`

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

      {/* ── Section tabs ───────────────────────────────────────── */}
      <div className="theory-tabs">
        <button className={`theory-tab-btn${section === 'notes' ? ' active' : ''}`}
          onClick={() => setSection('notes')}>Sheet Music</button>
        <button className={`theory-tab-btn${section === 'ear' ? ' active' : ''}`}
          onClick={() => setSection('ear')}>Ear Training</button>
        <button className={`theory-tab-btn${section === 'roman' ? ' active' : ''}`}
          onClick={() => setSection('roman')}>Roman Numeral</button>
      </div>

      {/* ════════════════════════════════════════════════════════
          SHEET MUSIC SECTION
      ════════════════════════════════════════════════════════ */}
      {section === 'notes' && (<>
        <div className="theory-tabs" style={{ marginTop: 6 }}>
          <button className={`theory-tab-btn${theoryTab === 'learn' ? ' active' : ''}`}
            onClick={() => setTheoryTab('learn')}>Learn</button>
          <button className={`theory-tab-btn${theoryTab === 'quiz' ? ' active' : ''}`}
            onClick={() => setTheoryTab('quiz')}>Quiz</button>
        </div>

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

        {theoryTab === 'learn' && (
          <>
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

            <div className="theory-controls">
              <label className="labels-toggle">
                <span className="labels-toggle-text">Note labels</span>
                <div className={`toggle-track${showLabels ? ' on' : ''}`}
                  onClick={() => setShowLabels(v => !v)}>
                  <div className="toggle-knob" />
                </div>
              </label>
            </div>

            {instrument === 'piano' && (
              <div className="theory-piano-wrap">
                <div className="piano-scroll" ref={learnScrollRef}>
                  <div className="piano-spacer" />
                  <Piano onPress={pressLearn} getKeyClass={getLearnKeyClass} showLabels={showLabels} />
                  <div className="piano-spacer" />
                </div>
              </div>
            )}
            {instrument === 'guitar' && (
              <Fretboard onPress={pressLearn} getNoteDisplay={getLearnNoteDisplay} showLabels={showLabels} />
            )}
          </>
        )}

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

            {instrument === 'piano' && (
              <div className="theory-piano-wrap">
                <div className="piano-scroll" ref={quizScrollRef}>
                  <div className="piano-spacer" />
                  <Piano onPress={pressQuizKey} getKeyClass={getQuizKeyClass} showLabels={false} />
                  <div className="piano-spacer" />
                </div>
              </div>
            )}
            {instrument === 'guitar' && (
              <Fretboard onPress={pressQuizKey} getNoteDisplay={getQuizNoteDisplay} showLabels />
            )}
          </div>
        )}
      </>)}

      {/* ════════════════════════════════════════════════════════
          EAR TRAINING SECTION
      ════════════════════════════════════════════════════════ */}
      {section === 'ear' && (
        <>
          {/* ET sub-tabs */}
          <div className="theory-tabs" style={{ marginTop: 6 }}>
            <button className={`theory-tab-btn${etTab === 'learn' ? ' active' : ''}`}
              onClick={() => setEtTab('learn')}>Learn</button>
            <button className={`theory-tab-btn${etTab === 'quiz' ? ' active' : ''}`}
              onClick={() => setEtTab('quiz')}>Quiz</button>
          </div>

          {/* ── ET Learn ───────────────────────────────────────── */}
          {etTab === 'learn' && (
            <div className="et-learn">

              {/* Scale / Chord mode */}
              <div className="seg-control">
                <button className={`seg-btn${etLearnMode === 'scale' ? ' active' : ''}`}
                  onClick={() => switchEtLearnMode('scale')}>Scale</button>
                <button className={`seg-btn${etLearnMode === 'chord' ? ' active' : ''}`}
                  onClick={() => switchEtLearnMode('chord')}>Chord</button>
              </div>

              {/* Root picker */}
              <div className="et-learn-section">
                <span className="et-pool-label">Root</span>
                <div className="et-learn-root-row">
                  {ROOT_NAMES_FROM_A.map(name => (
                    <button key={name}
                      className={`et-learn-root-btn${etLearnRoot === name ? ' active' : ''}`}
                      onClick={() => setEtLearnRoot(name)}>{name}</button>
                  ))}
                </div>
              </div>

              {/* Type select */}
              <div className="et-learn-section">
                <span className="et-pool-label">
                  {etLearnMode === 'scale' ? 'Scale' : 'Chord'}
                </span>
                <select className="et-learn-select"
                  value={etLearnType}
                  onChange={e => setEtLearnType(e.target.value)}>
                  {etLearnMode === 'scale'
                    ? Object.keys(SCALE_INTERVALS).map(t => (
                        <option key={t} value={t}>{SCALE_DISPLAY_NAMES[t] ?? t}</option>
                      ))
                    : Object.keys(CHORD_INTERVALS).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))
                  }
                </select>
              </div>

              {/* Note display */}
              <div className="et-learn-notes">
                {etLearnNotes.join(' – ')}
              </div>

              {/* Play button */}
              <button className="et-play-btn" onClick={etLearnPlay}>
                ▶&nbsp; Play {etLearnLabel}
              </button>

            </div>
          )}

          {/* ── ET Quiz ────────────────────────────────────────── */}
          {etTab === 'quiz' && (
            <div className="et-area">

              {/* Mode tabs */}
              <div className="et-mode-tabs">
                {(['note', 'scale', 'chord'] as EtMode[]).map(m => (
                  <button key={m}
                    className={`et-mode-btn${etMode === m ? ' active' : ''}`}
                    onClick={() => { setEtMode(m); resetEt() }}>
                    {m === 'note' ? 'Note' : m === 'scale' ? 'Scale' : 'Chord'}
                  </button>
                ))}
              </div>

              {/* Note pool */}
              <div className="et-pool-section">
                <span className="et-pool-label">
                  {etMode === 'note' ? 'Notes to quiz:' : 'Root notes:'}
                </span>
                <div className="et-pool-btns">
                  {ROOT_NAMES_FROM_A.map(name => (
                    <button key={name}
                      className={`et-pool-btn${etNotePool.has(name) ? ' active' : ''}`}
                      onClick={() => toggleEtNote(name)}>{name}</button>
                  ))}
                </div>
              </div>

              {/* Scale type pool */}
              {etMode === 'scale' && (
                <div className="et-pool-section">
                  <span className="et-pool-label">Scale types:</span>
                  <div className="et-pool-btns">
                    {Object.keys(SCALE_INTERVALS).map(type => (
                      <button key={type}
                        className={`et-pool-btn${etScalePool.has(type) ? ' active' : ''}`}
                        onClick={() => toggleEtScale(type)}>
                        {SCALE_DISPLAY_NAMES[type] ?? type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chord type pool */}
              {etMode === 'chord' && (
                <div className="et-pool-section">
                  <span className="et-pool-label">Chord types:</span>
                  <div className="et-pool-btns">
                    {Object.keys(CHORD_INTERVALS).map(type => (
                      <button key={type}
                        className={`et-pool-btn${etChordPool.has(type) ? ' active' : ''}`}
                        onClick={() => toggleEtChord(type)}>{type}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Score + replay */}
              <div className="et-header">
                <span className="et-score-text">{etScore.correct} / {etScore.total}</span>
                {etRootMidi !== null && (
                  <button className="et-replay-btn" onClick={etReplay}>▶ Replay</button>
                )}
              </div>

              {/* Prompt */}
              <p className={`et-prompt${etRevealed ? (etWasCorrect ? ' correct' : ' wrong') : ''}`}>
                {etRootMidi === null
                  ? etMode === 'note' ? 'Press Start to hear a note'
                    : etMode === 'scale' ? 'Press Start to hear a scale'
                    : 'Press Start to hear a chord'
                  : etRevealed
                    ? etWasCorrect ? '✓ Correct!' : `✗  It was "${etAnswer}"`
                    : etMode === 'note' ? 'Which note did you hear?'
                      : etMode === 'scale' ? 'Which scale did you hear?'
                      : 'Which chord did you hear?'}
              </p>

              {/* Primary action button */}
              {(etRootMidi === null || etRevealed) && (
                <button className="et-play-btn" onClick={etNext}>
                  {etRootMidi === null ? '▶  Start' : 'Next →'}
                </button>
              )}

              {/* Answer choices */}
              {etRootMidi !== null && (
                <div className="et-choices">
                  {etChoices.map(choice => (
                    <button key={choice}
                      className={`et-choice-btn${etRevealed
                        ? choice === etAnswer ? ' et-correct' : ' et-missed'
                        : ''}`}
                      disabled={etRevealed}
                      onClick={() => etGuess(choice)}>
                      {choice}
                    </button>
                  ))}
                </div>
              )}

            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          ROMAN NUMERAL SECTION
      ════════════════════════════════════════════════════════ */}
      {section === 'roman' && (() => {
        const keyPc    = ROOT_NAME_TO_PC[rnKey] ?? 0
        const degrees  = rnScaleMode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES

        return (
          <div className="rn-area">

            {/* Major / Minor toggle */}
            <div className="seg-control">
              <button className={`seg-btn${rnScaleMode === 'major' ? ' active' : ''}`}
                onClick={() => setRnScaleMode('major')}>Major</button>
              <button className={`seg-btn${rnScaleMode === 'minor' ? ' active' : ''}`}
                onClick={() => setRnScaleMode('minor')}>Minor</button>
            </div>

            {/* Key picker */}
            <div className="rn-key-section">
              <span className="et-pool-label">Key</span>
              <div className="rn-key-row">
                {ROOT_NAMES_FROM_A.map(name => (
                  <button key={name}
                    className={`rn-key-btn${rnKey === name ? ' active' : ''}`}
                    onClick={() => setRnKey(name)}>{name}</button>
                ))}
              </div>
            </div>

            {/* Chord cards */}
            <div className="rn-grid">
              {degrees.map((deg, idx) => {
                const rootPc    = (keyPc + deg.semitone) % 12
                const rootName  = RN_NOTE[rootPc]
                const chordName = `${rootName} ${deg.type}`
                const noteNames = (CHORD_INTERVALS[deg.type] ?? [])
                  .map(iv => RN_NOTE[(rootPc + iv) % 12])
                  .join(' – ')
                const colorClass = deg.type === 'Major' ? ' rn-major'
                  : deg.type === 'Minor' ? ' rn-minor'
                  : ' rn-dim'

                return (
                  <button key={idx}
                    className={`rn-card${colorClass}${rnActive === idx ? ' rn-active' : ''}`}
                    onClick={() => rnPlay(rootPc, deg.type, idx)}>
                    <span className="rn-roman">{deg.roman}</span>
                    <span className="rn-chord-name">{chordName}</span>
                    <span className="rn-chord-notes">{noteNames}</span>
                  </button>
                )
              })}
            </div>

          </div>
        )
      })()}
    </div>
  )
}
