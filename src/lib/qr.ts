import QRCode from 'qrcode'

/** El QR contiene únicamente un token opaco: nunca DNI, nombre ni montos. */
export const qrPayload = (token: string): string => `ARCANGEL2004:${token}`

export async function qrDataUrl(token: string, size = 320): Promise<string> {
  return QRCode.toDataURL(qrPayload(token), {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#12351b', light: '#ffffff' },
  })
}

export async function qrSvg(token: string): Promise<string> {
  return QRCode.toString(qrPayload(token), { type: 'svg', margin: 1, color: { dark: '#12351b', light: '#ffffff' } })
}

export const parseQr = (raw: string): string | null => {
  const text = (raw || '').trim()
  if (text.startsWith('ARCANGEL2004:')) return text.slice('ARCANGEL2004:'.length)
  // Compatibilidad: aceptar un token pegado manualmente (uuid / hex de 32+)
  if (/^[a-zA-Z0-9-]{16,64}$/.test(text)) return text
  return null
}
