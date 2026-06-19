// ── Shared note data ──────────────────────────────────────────────
export const NOTE_NAMES      = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
export const IS_BLACK        = [false, true, false, true, false, false, true, false, true, false, true, false]

// Common root names with preferred enharmonic spellings (Bb not A#, Eb not D#, etc.)
export const ROOT_NAMES         = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const ROOT_NAMES_FROM_A  = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab']
export const PC_FROM_A          = [9,   10,   11,  0,   1,    2,   3,    4,   5,   6,    7,   8  ]

// Root name → pitch class (covers both sharp and flat spellings)
export const ROOT_NAME_TO_PC: Record<string, number> = {
  'C': 0, 'Db': 1, 'C#': 1, 'D': 2, 'Eb': 3, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'Ab': 8, 'G#': 8, 'A': 9, 'Bb': 10, 'A#': 10, 'B': 11,
}

// Which major/minor roots conventionally use flat enharmonics
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1])    // F Bb Eb Ab Db
const FLAT_MINOR = new Set([10, 0, 2, 3, 5, 7])  // Bbm Cm Dm Ebm Fm Gm

// Chord/scale types that follow minor-key flat conventions
const MINOR_FLAVORED = new Set([
  'Minor', 'Minor 7', 'Diminished',
  'Dorian', 'Phrygian', 'Locrian',
  'Minor Pentatonic', 'Blues', 'Harmonic Minor', 'Melodic Minor', 'Hungarian Minor',
])

export function usesFlatEnharmonic(root: number, patternType: string): boolean {
  return MINOR_FLAVORED.has(patternType) ? FLAT_MINOR.has(root) : FLAT_MAJOR.has(root)
}

// ── Piano layout ──────────────────────────────────────────────────
export const WHITE_W = 36
export const WHITE_H = 132
export const BLACK_W = 22
export const BLACK_H = 82

export interface Key {
  midi: number
  note: string
  octave: number
  black: boolean
  left: number
}

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

export const KEYS     = buildKeys()
export const PIANO_W  = 52 * WHITE_W
export const MIDDLE_C = KEYS.find(k => k.midi === 60)!

// ── Fretboard layout (standard tuning) ───────────────────────────
export const OPEN_STRINGS = [64, 59, 55, 50, 45, 40]  // E4 B3 G3 D3 A2 E2
export const NUM_FRETS    = 12
export const MARKER_FRETS = new Set([3, 5, 7, 9, 12])

export const TOP_PAD    = 30
export const BOT_PAD    = 20
export const NUT_X      = 32
export const NUT_W      = 4
export const FRET_W     = 44
export const STRING_H   = 30
export const CIRCLE_R   = 11
export const NUM_STRINGS = OPEN_STRINGS.length
export const FB_W = NUT_X + NUT_W + NUM_FRETS * FRET_W + 16
export const FB_H = TOP_PAD + (NUM_STRINGS - 1) * STRING_H + BOT_PAD

export function fretX(fret: number): number {
  return fret === 0
    ? NUT_X - CIRCLE_R - 3
    : NUT_X + NUT_W + (fret - 0.5) * FRET_W
}

export function strY(si: number): number {
  return TOP_PAD + si * STRING_H
}

// ── Audio synthesis ───────────────────────────────────────────────
export function playNote(midi: number, ctx: AudioContext): void {
  const freq = 440 * Math.pow(2, (midi - 69) / 12)
  const now  = ctx.currentTime
  const dur  = 1.6 + (108 - midi) / 87 * 1.4

  // "Missing fundamental" technique: for low notes, the fundamental sits below
  // what small speakers can reproduce, so we shift energy into the 2nd and 3rd
  // harmonics. The brain still hears the correct pitch (harmonic pattern is enough)
  // but the note cuts through clearly instead of sounding muddy and bass-heavy.
  // low = 0 at F4 and above (no change), 1 at E2 and below (full boost).
  const low = Math.max(0, Math.min(1, (65 - midi) / 25))

  const master = ctx.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(0.46, now + 0.006)
  master.gain.exponentialRampToValueAtTime(0.26, now + 0.10)
  master.gain.exponentialRampToValueAtTime(0.001, now + dur)
  master.connect(ctx.destination)

  // [partial, gain-high-notes, gain-low-notes]
  const harmonics: [number, number, number][] = [
    [1, 0.50, 0.12],  // fundamental — pulled back for low notes
    [2, 0.25, 0.52],  // octave — boosted, carries pitch on small speakers
    [3, 0.12, 0.26],  // P5 above octave — adds presence
    [4, 0.06, 0.12],  // 2nd octave
    [6, 0.03, 0.07],
    [8, 0.01, 0.03],
  ]

  harmonics.forEach(([p, gHigh, gLow]) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq * p
    const g = ctx.createGain()
    g.gain.value = gHigh + (gLow - gHigh) * low
    osc.connect(g); g.connect(master)
    osc.start(now); osc.stop(now + dur + 0.05)
  })
}
