export function Splash() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(160deg,#12351b,#17441f 60%,#0f2e18)',
      }}
    >
      <div style={{ textAlign: 'center', display: 'grid', gap: 18, justifyItems: 'center' }}>
        <img src={`${import.meta.env.BASE_URL}img/logo.png`} alt="Comparsa San Miguel Arcángel 2004" style={{ width: 250, filter: 'drop-shadow(0 14px 34px rgba(0,0,0,.4))' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: 700, letterSpacing: '.14em' }}>
          <span className="loader" /> PLATAFORMA INSTITUCIONAL
        </div>
      </div>
    </div>
  )
}
