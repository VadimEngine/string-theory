import { useRef } from 'react'
import {
  NOTE_NAMES,
  OPEN_STRINGS, NUM_FRETS, MARKER_FRETS,
  TOP_PAD, NUT_X, NUT_W, FRET_W, STRING_H, CIRCLE_R,
  NUM_STRINGS, FB_W, FB_H,
  fretX, strY,
} from '../music'
import './Fretboard.css'

export interface NoteStyle {
  fill: string
  stroke: string
  labelFill: string
  label?: string  // override the note name shown in the circle
}

interface FretboardProps {
  onPress: (midi: number) => void
  getNoteDisplay: (midi: number) => NoteStyle | null
  showLabels?: boolean
}

export default function Fretboard({ onPress, getNoteDisplay, showLabels = true }: FretboardProps) {
  const draggingRef = useRef(false)
  const lastMidiRef = useRef<number | null>(null)

  function moveDrag(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const el  = document.elementFromPoint(e.clientX, e.clientY)
    const str = el?.getAttribute('data-midi') ?? el?.closest('[data-midi]')?.getAttribute('data-midi')
    if (!str) return
    const midi = parseInt(str)
    if (midi !== lastMidiRef.current) { lastMidiRef.current = midi; onPress(midi) }
  }

  function endDrag() { draggingRef.current = false }

  return (
    <>
      <div className="fretboard-scroll">
        <svg viewBox={`0 0 ${FB_W} ${FB_H}`} width={FB_W} height={FB_H}
          style={{ touchAction: 'none', display: 'block' }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
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
            <text key={fret} x={fretX(fret)} y={TOP_PAD - 10}
              textAnchor="middle" fontSize="9"
              fill={MARKER_FRETS.has(fret) ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'}
              style={{ userSelect: 'none' }}>
              {fret}
            </text>
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
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          ))}

          {/* Note circles */}
          {OPEN_STRINGS.map((openMidi, si) =>
            Array.from({ length: NUM_FRETS + 1 }, (_, fret) => {
              const midi    = openMidi + fret
              const display = getNoteDisplay(midi)
              if (!display) return null
              const cx = fretX(fret), cy = strY(si)
              return (
                <g key={fret}>
                  <circle cx={cx} cy={cy} r={CIRCLE_R}
                    fill={display.fill} stroke={display.stroke} strokeWidth="1.5" />
                  {showLabels && (
                    <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fontWeight="700"
                      fill={display.labelFill}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {display.label ?? NOTE_NAMES[midi % 12]}
                    </text>
                  )}
                </g>
              )
            })
          )}

          {/* Transparent hit areas */}
          {OPEN_STRINGS.map((openMidi, si) =>
            Array.from({ length: NUM_FRETS + 1 }, (_, fret) => {
              const midi = openMidi + fret
              const cy   = strY(si)
              const x    = fret === 0 ? fretX(0) - CIRCLE_R - 2 : NUT_X + NUT_W + (fret - 1) * FRET_W
              const w    = fret === 0 ? CIRCLE_R * 2 + 4 : FRET_W
              return (
                <rect key={fret} data-midi={midi}
                  x={x} y={cy - STRING_H / 2} width={w} height={STRING_H}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onPointerDown={() => {
                    draggingRef.current = true
                    lastMidiRef.current = midi
                    onPress(midi)
                  }}
                />
              )
            })
          )}
        </svg>
      </div>
      <div className="string-hint">High E · B · G · D · A · Low E &nbsp;·&nbsp; Standard tuning</div>
    </>
  )
}
