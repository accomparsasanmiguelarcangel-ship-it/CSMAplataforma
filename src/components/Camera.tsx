import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Icon } from './ui'

/* ──────────────────────────────────────────────────────────────────────────
   Captura de selfie con la cámara FRONTAL.
   Requisito del proyecto: la foto debe tomarse desde la cámara, nunca
   seleccionarse de la galería. No existe input[type=file] en este flujo.
   ────────────────────────────────────────────────────────────────────────── */

export function SelfieCapture({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<'idle' | 'starting' | 'live' | 'error'>('idle')
  const [error, setError] = useState('')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => stop(), [])

  const start = async () => {
    setState('starting')
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder a la cámara.')
      stop()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1080 }, height: { ideal: 1440 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setState('live')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo abrir la cámara.'
      setError(
        /NotAllowed|Permission|denied/i.test(msg)
          ? 'Permiso de cámara denegado. Habilita la cámara para este sitio en los ajustes del navegador y vuelve a intentarlo.'
          : /NotFound|Devices/i.test(msg)
            ? 'No se detectó una cámara disponible en este dispositivo.'
            : msg,
      )
      setState('error')
    }
  }

  const capture = () => {
    const v = videoRef.current
    if (!v) return
    const w = v.videoWidth || 720
    const h = v.videoHeight || 960
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (facing === 'user') {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(v, 0, 0, w, h)
    onChange(canvas.toDataURL('image/jpeg', 0.86))
    stop()
    setState('idle')
  }

  if (value) {
    return (
      <div className="stack">
        <div className="selfie-preview"><img src={value} alt="Vista previa de la selfie" /></div>
        <div className="row wrap">
          <button type="button" className="btn btn-sm" onClick={() => { onChange(null); start() }}>
            <Icon name="camera" size={15} /> Repetir fotografía
          </button>
          <span className="badge ok"><Icon name="check" size={12} /> Selfie capturada</span>
        </div>
        <span className="hint">Esta fotografía se usará para tu credencial y para la verificación visual al escanear tu QR.</span>
      </div>
    )
  }

  return (
    <div className="stack">
      {state === 'live' ? (
        <div className="cam-shell">
          <video ref={videoRef} playsInline muted style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
          <div className="cam-frame" />
          <div className="cam-note">Ubica tu rostro dentro del óvalo, con buena luz y sin gorra.</div>
        </div>
      ) : (
        <div className="cam-shell" style={{ background: 'linear-gradient(160deg,#12351b,#1f5b2a)' }}>
          <div style={{ padding: 22, textAlign: 'center', color: '#fff', display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'rgba(255,255,255,.12)', display: 'grid', placeItems: 'center' }}>
              <Icon name="camera" size={28} />
            </div>
            <strong style={{ fontSize: '0.92rem' }}>Fotografía obligatoria</strong>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,.75)', maxWidth: '34ch' }}>
              Debes tomarte una selfie con la cámara frontal para completar la inscripción.
            </p>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="banner bad">
          <Icon name="alert" size={18} />
          <div><strong>No se pudo acceder a la cámara</strong>{error}</div>
        </div>
      )}

      <div className="row wrap">
        {state !== 'live' ? (
          <button type="button" className="btn btn-primary" onClick={start} disabled={state === 'starting'}>
            <Icon name="camera" size={16} /> {state === 'starting' ? 'Abriendo cámara…' : 'Abrir cámara frontal'}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={capture}>
              <Icon name="check" size={16} /> Tomar fotografía
            </button>
            <button type="button" className="btn" onClick={() => { stop(); setState('idle') }}>Cancelar</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { stop(); setFacing(facing === 'user' ? 'environment' : 'user'); setTimeout(start, 120) }}>
              Cambiar cámara
            </button>
          </>
        )}
      </div>
      <span className="hint">La imagen se guarda en tu carpeta individual de Google Drive como <span className="mono">&lt;código&gt;_SELFIE.jpg</span>.</span>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Escáner de QR con la cámara trasera + entrada manual del token.
   ────────────────────────────────────────────────────────────────────────── */

export function QrScanner({ onDetected, onError }: { onDetected: (raw: string) => void; onError?: (msg: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const [live, setLive] = useState(false)
  const [msg, setMsg] = useState('')

  const stop = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLive(false)
  }

  useEffect(() => () => stop(), [])

  const start = async () => {
    setMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setLive(true)
      tick()
    } catch (e) {
      const m = e instanceof Error ? e.message : 'No se pudo abrir la cámara.'
      setMsg(/NotAllowed|Permission|denied/i.test(m) ? 'Permiso de cámara denegado. Habilítalo en el navegador.' : m)
      onError?.(m)
    }
  }

  const tick = () => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      const w = v.videoWidth
      const h = v.videoHeight
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(v, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
        if (code?.data) {
          if (navigator.vibrate) navigator.vibrate(70)
          onDetected(code.data)
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  return (
    <div className="stack">
      <div className="cam-shell landscape" style={{ background: live ? '#0b1a10' : 'linear-gradient(160deg,#12351b,#1f5b2a)' }}>
        {live ? (
          <>
            <video ref={videoRef} playsInline muted />
            <div className="cam-frame rect" />
            <div className="scan-line" />
            <div className="cam-note">Apunta el QR de la credencial al centro del recuadro</div>
          </>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#fff', display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ width: 62, height: 62, borderRadius: 16, background: 'rgba(255,255,255,.12)', display: 'grid', placeItems: 'center' }}>
              <Icon name="scan" size={30} />
            </div>
            <strong style={{ fontSize: '0.92rem' }}>Control de asistencia</strong>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,.75)', maxWidth: '34ch' }}>
              Activa la cámara para leer la credencial del participante.
            </p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="row wrap">
        {!live ? (
          <button type="button" className="btn btn-primary" onClick={start}><Icon name="scan" size={16} /> Activar escáner</button>
        ) : (
          <button type="button" className="btn" onClick={stop}>Detener cámara</button>
        )}
      </div>
      {msg && <div className="banner bad"><Icon name="alert" size={18} /><div>{msg}</div></div>}
    </div>
  )
}
