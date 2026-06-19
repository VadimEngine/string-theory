import { useRef } from 'react'
import { KEYS, PIANO_W, WHITE_W, WHITE_H, BLACK_W, BLACK_H } from '../music'
import './Piano.css'

interface PianoProps {
  onPress: (midi: number) => void
  getKeyClass: (midi: number) => string
  showLabels?: boolean
}

export default function Piano({ onPress, getKeyClass, showLabels = true }: PianoProps) {
  const draggingRef = useRef(false)
  const lastMidiRef = useRef<number | null>(null)

  function startDrag(midi: number) {
    draggingRef.current = true
    lastMidiRef.current = midi
    onPress(midi)
  }

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
    <div className="piano-keys" style={{ width: PIANO_W }}
      onPointerDown={e => {
        const str = (e.target as HTMLElement).closest('[data-midi]')?.getAttribute('data-midi')
        if (str) startDrag(parseInt(str))
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {KEYS.filter(k => !k.black).map(k => (
        <div key={k.midi} data-midi={k.midi}
          className={`pkey white${getKeyClass(k.midi)}`}
          style={{ left: k.left, width: WHITE_W - 1, height: WHITE_H }}>
          {showLabels && <span className="key-label-white">{k.note}{k.octave}</span>}
        </div>
      ))}
      {KEYS.filter(k => k.black).map(k => (
        <div key={k.midi} data-midi={k.midi}
          className={`pkey black${getKeyClass(k.midi)}`}
          style={{ left: k.left, width: BLACK_W, height: BLACK_H }}>
          {showLabels && <span className="key-label-black">{k.note}</span>}
        </div>
      ))}
    </div>
  )
}
