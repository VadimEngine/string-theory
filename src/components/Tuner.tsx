import { useState, useEffect, useRef, useCallback } from 'react'
import './Tuner.css'

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const TUNINGS: Record<string, string[]> = {
  'Standard':      ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  'Drop D':        ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  'Drop C':        ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'],
  '4-String Bass': ['E1', 'A1', 'D2', 'G2'],
  '5-String Bass': ['B0', 'E1', 'A1', 'D2', 'G2'],
}

function detectPitch(buffer: Float32Array, sampleRate: number): number {
  const N = buffer.length

  // Reject silence
  let rms = 0
  for (let i = 0; i < N; i++) rms += buffer[i] * buffer[i]
  if (Math.sqrt(rms / N) < 0.008) return -1

  // B0 (~31 Hz) to high E (~1319 Hz)
  const minLag = Math.ceil(sampleRate / 1400)
  const maxLag = Math.min(Math.floor(sampleRate / 28), Math.floor(N / 2))

  // Compute McLeod NSDF: m(lag) = 2*acf(lag) / (Σx² + Σx[lag+]²)
  const nsdf = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0, d1 = 0, d2 = 0
    for (let i = 0; i < N - lag; i++) {
      num += buffer[i] * buffer[i + lag]
      d1  += buffer[i] * buffer[i]
      d2  += buffer[i + lag] * buffer[i + lag]
    }
    const denom = (d1 + d2) * 0.5
    nsdf[lag] = denom > 0 ? num / denom : 0
  }

  // Find the first local maximum above threshold (= fundamental period)
  // Threshold 0.45 works for real microphone/guitar input
  const THRESHOLD = 0.45
  let peakLag = -1
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > THRESHOLD) {
      peakLag = lag
      break
    }
  }

  if (peakLag === -1) return -1

  // Parabolic interpolation for sub-sample accuracy
  const y1 = nsdf[peakLag - 1], y2 = nsdf[peakLag], y3 = nsdf[peakLag + 1]
  const d = 2 * y2 - y1 - y3
  const T0 = d !== 0 ? peakLag + (y3 - y1) / (2 * d) : peakLag

  return sampleRate / T0
}

function freqToNoteInfo(freq: number) {
  if (freq <= 0) return null
  const midi = 69 + 12 * Math.log2(freq / 440)
  const rounded = Math.round(midi)
  const cents = Math.round((midi - rounded) * 100)
  const noteIdx = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return {
    note: NOTES[noteIdx],
    octave,
    cents,
    freq: Math.round(freq * 10) / 10,
  }
}

type NoteInfo = ReturnType<typeof freqToNoteInfo>

// SVG semicircular gauge: arc spans 140° (-70° to +70° from 12 o'clock)
const CX = 100, CY = 105, R = 80
const MAX_DEG = 70

function polarToXY(deg: number, radius: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}

function arcPath(r: number, startDeg: number, endDeg: number) {
  const s = polarToXY(startDeg, r)
  const e = polarToXY(endDeg, r)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

export default function Tuner() {
  const [active, setActive]         = useState(false)
  const [tuning, setTuning]         = useState('Standard')
  const [noteInfo, setNoteInfo]     = useState<NoteInfo>(null)
  const [volume, setVolume]         = useState(0)
  const [tunedStrings, setTunedStrings] = useState<Set<string>>(new Set())
  const [error, setError]           = useState('')

  const streamRef      = useRef<MediaStream | null>(null)
  const analyserRef    = useRef<AnalyserNode | null>(null)
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  // Require CONFIRM_FRAMES consecutive in-tune detections before locking green
  const CONFIRM_FRAMES = 5
  const pendingTuneRef = useRef<{ key: string; count: number } | null>(null)

  const analyze = useCallback(() => {
    if (!analyserRef.current) return
    const buf = new Float32Array(analyserRef.current.fftSize)
    analyserRef.current.getFloatTimeDomainData(buf)

    // RMS → 0-1 volume level (scale so typical playing fills ~60-80%)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    setVolume(Math.min(1, Math.sqrt(sum / buf.length) * 6))

    const freq = detectPitch(buf, analyserRef.current.context.sampleRate)
    if (freq > 0) {
      const info = freqToNoteInfo(freq)
      setNoteInfo(info)
      if (info) {
        const key = `${info.note}${info.octave}`
        if (Math.abs(info.cents) <= 5) {
          // Accumulate consecutive in-tune frames; only lock after CONFIRM_FRAMES
          if (pendingTuneRef.current?.key === key) {
            pendingTuneRef.current.count++
          } else {
            pendingTuneRef.current = { key, count: 1 }
          }
          if (pendingTuneRef.current.count >= CONFIRM_FRAMES) {
            setTunedStrings(prev => prev.has(key) ? prev : new Set([...prev, key]))
          }
        } else {
          // Note detected but out of tune — reset pending and un-mark if it was green
          if (pendingTuneRef.current?.key === key) pendingTuneRef.current = null
          setTunedStrings(prev => {
            if (!prev.has(key)) return prev
            const n = new Set(prev); n.delete(key); return n
          })
        }
      }
    }
  }, [])

  const startTuner = useCallback(async () => {
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser
      ctx.createMediaStreamSource(stream).connect(analyser)
      setActive(true)
      timerRef.current = setInterval(analyze, 80)
    } catch {
      setError('Microphone access denied. Please allow mic access and try again.')
    }
  }, [analyze])

  const stopTuner = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    streamRef.current = null
    audioCtxRef.current = null
    analyserRef.current = null
    pendingTuneRef.current = null
    setActive(false)
    setNoteInfo(null)
    setVolume(0)
    setTunedStrings(new Set())
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
  }, [])

  const cents      = noteInfo?.cents ?? 0
  const inTune     = active && noteInfo !== null && Math.abs(cents) <= 5
  const needleDeg  = -MAX_DEG + (MAX_DEG * 2) * ((cents + 50) / 100)
  const needleColor = inTune ? '#4ade80' : active && noteInfo ? '#f87171' : 'rgba(255,255,255,0.2)'

  return (
    <div className="tuner">
      {/* Tuning presets */}
      <div className="tuner-presets">
        {Object.keys(TUNINGS).map(name => (
          <button
            key={name}
            className={`preset-btn${tuning === name ? ' active' : ''}`}
            onClick={() => { setTuning(name); setTunedStrings(new Set()); pendingTuneRef.current = null }}
          >
            {name}
          </button>
        ))}
      </div>

      {/* String reference */}
      <div className="tuner-strings">
        {TUNINGS[tuning].map((s, i) => {
          const tuned    = tunedStrings.has(s)
          const detected = !tuned && noteInfo != null && s === `${noteInfo.note}${noteInfo.octave}`
          return (
            <div key={i} className={`string-note${tuned ? ' tuned' : detected ? ' detected' : ''}`}>
              {s}
            </div>
          )
        })}
      </div>

      {/* Volume meter */}
      <div className="volume-meter" aria-label="Volume level">
        {Array.from({ length: 20 }, (_, i) => {
          const lit = active && volume >= (i + 1) / 20
          const color = i < 13 ? 'green' : i < 17 ? 'yellow' : 'red'
          return (
            <div
              key={i}
              className={`vol-bar${lit ? ` lit-${color}` : ''}`}
            />
          )
        })}
      </div>

      {/* Gauge */}
      <div className="tuner-gauge-wrap">
        <svg viewBox="0 25 200 110" className="tuner-gauge-svg">
          {/* Background arc */}
          <path d={arcPath(R, -MAX_DEG, MAX_DEG)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeLinecap="round" />

          {/* Center tick */}
          {(() => { const p0 = polarToXY(0, R - 10); const p1 = polarToXY(0, R + 6); return (
            <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
          )})()}

          {/* Side ticks at ±25 and ±50 cents */}
          {[-MAX_DEG, -MAX_DEG/2, MAX_DEG/2, MAX_DEG].map(deg => {
            const p0 = polarToXY(deg, R - 6)
            const p1 = polarToXY(deg, R + 4)
            return <line key={deg} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
          })}

          {/* Needle — rotated around pivot via CSS transform so transition works */}
          <g
            style={{
              transformOrigin: `${CX}px ${CY}px`,
              transform: `rotate(${needleDeg}deg)`,
              transition: 'transform 0.08s ease-out',
            }}
          >
            <line
              x1={CX} y1={CY}
              x2={CX} y2={CY - 70}
              stroke={needleColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ transition: 'stroke 0.15s' }}
            />
          </g>

          {/* Pivot */}
          <circle cx={CX} cy={CY} r="4" fill="rgba(255,255,255,0.55)" />
        </svg>

        {/* Cent labels */}
        <div className="gauge-labels">
          <span>-50</span>
          <span>0</span>
          <span>+50</span>
        </div>
      </div>

      {/* Note readout */}
      <div className={`tuner-readout${inTune ? ' in-tune' : ''}`}>
        {active && noteInfo ? (
          <>
            <span className="readout-note">{noteInfo.note}<span className="readout-octave">{noteInfo.octave}</span></span>
            <span className="readout-freq">{noteInfo.freq} Hz</span>
            <span className="readout-cents">{cents > 0 ? '+' : ''}{cents} ¢</span>
            {inTune && <span className="readout-intune">✓ In Tune</span>}
          </>
        ) : (
          <span className="readout-idle">—</span>
        )}
      </div>

      {error && <p className="tuner-error">{error}</p>}

      {/* Toggle */}
      <button
        className={`tuner-toggle${active ? ' stop' : ''}`}
        onClick={active ? stopTuner : startTuner}
      >
        {active ? 'Stop' : 'Start Tuner'}
      </button>
    </div>
  )
}
