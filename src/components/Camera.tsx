import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Icon } from './ui'

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'El navegador bloqueó la cámara. Permite el acceso a la cámara para este sitio y comprueba que la página esté abierta mediante HTTPS.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se detectó una cámara disponible en este dispositivo.'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentarlo.'
  if (name === 'OverconstrainedError') return 'La cámara no admite la configuración solicitada. Prueba con otra cámara.'
  return error instanceof Error ? error.message : 'No se pudo abrir la cámara.'
}

export function SelfieCapture({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<'idle' | 'starting' | 'live' | 'error'>('idle')
  const [error, setError] = useState('')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  // El video aparece en el DOM al cambiar a live; conecta el stream después del render.
  useEffect(() => {
    if (state !== 'live') return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    video.srcObject = stream
    video.play().catch((e) => {
      setError(cameraError(e))
      setState('error')
      stop()
    })
  }, [state])

  const start = async (targetFacing: 'user' | 'environment' = facing) => {
    setState('starting')
    setError('')
    try {
      if (!window.isSecureContext) throw new Error('La cámara requiere una página segura HTTPS. Abre la dirección publicada de la plataforma.')
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder a la cámara. Actualiza el navegador o prueba Chrome/Edge.')
      stop()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setState('live')
    } catch (e) {
      setError(cameraError(e))
      setState('error')
      stop()
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setError('La cámara se abrió, pero todavía no entrega imagen. Espera un momento y vuelve a intentarlo.')
      setState('error')
      stop()
      return
    }
    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      setError('No se pudo procesar la fotografía. Vuelve a intentarlo.')
      return
    }
    if (facing === 'user') {
      context.translate(width, 0)
      context.scale(-1, 1)
    }
    context.drawImage(video, 0, 0, width, height)
    onChange(canvas.toDataURL('image/jpeg', 0.78))
    stop()
    setState('idle')
  }

  if (value) {
    return (
      <div className="stack">
        <div className="selfie-preview"><img src={value} alt="Vista previa de la selfie" /></div>
        <div className="row wrap">
          <button type="button" className="btn btn-sm" onClick={() => { onChange(null); void start('user') }}>
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
          <video ref={videoRef} playsInline autoPlay muted style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
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
      {state === 'error' && <div className="banner bad"><Icon name="alert" size={18} /><div><strong>No se pudo acceder a la cámara</strong>{error}</div></div>}
      <div className="row wrap">
        {state !== 'live' ? (
          <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={state === 'starting'}>
            <Icon name="camera" size={16} /> {state === 'starting' ? 'Abriendo cámara…' : 'Abrir cámara frontal'}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={capture}><Icon name="check" size={16} /> Tomar fotografía</button>
            <button type="button" className="btn" onClick={() => { stop(); setState('idle') }}>Cancelar</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              const next = facing === 'user' ? 'environment' : 'user'
              setFacing(next)
              void start(next)
            }}>Cambiar cámara</button>
          </>
        )}
      </div>
      <span className="hint">La imagen se guardará en la carpeta individual de Google Drive cuando confirmes tu correo e inicies sesión.</span>
    </div>
  )
}

export function QrScanner({ onDetected, onError }: { onDetected: (raw: string) => void; onError?: (msg: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const [live, setLive] = useState(false)
  const [msg, setMsg] = useState('')

  const stop = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setLive(false)
  }

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!live) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const stream = streamRef.current
    if (!video || !canvas || !stream) return
    video.srcObject = stream
    video.play().then(() => {
      const tick = () => {
        if (!videoRef.current || !canvasRef.current) return
        if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth && video.videoHeight) {
          const width = video.videoWidth
          const height = video.videoHeight
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (context) {
            const image = context.getImageData(0, 0, width, height)
            const code = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })
            if (code?.data) {
              if (navigator.vibrate) navigator.vibrate(70)
              onDetected(code.data)
              stop()
              return
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    }).catch((e) => {
      const message = cameraError(e)
      setMsg(message)
      onError?.(message)
      stop()
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [live])

  const start = async () => {
    setMsg('')
    try {
      if (!window.isSecureContext) throw new Error('La cámara requiere una página segura HTTPS.')
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder a la cámara.')
      stop()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setLive(true)
    } catch (e) {
      const message = cameraError(e)
      setMsg(message)
      onError?.(message)
      stop()
    }
  }

  return (
    <div className="stack">
      <div className="cam-shell landscape" style={{ background: live ? '#0b1a10' : 'linear-gradient(160deg,#12351b,#1f5b2a)' }}>
        {live ? (
          <>
            <video ref={videoRef} playsInline autoPlay muted />
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
          <button type="button" className="btn btn-primary" onClick={() => void start()}><Icon name="scan" size={16} /> Activar escáner</button>
        ) : (
          <button type="button" className="btn" onClick={stop}>Detener cámara</button>
        )}
      </div>
      {msg && <div className="banner bad"><Icon name="alert" size={18} /><div>{msg}</div></div>}
    </div>
  )
}
