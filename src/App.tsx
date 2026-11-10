import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { StoreProvider, useStore } from './lib/store'
import { ToastProvider } from './components/ui'
import Shell from './components/Shell'
import { Login, Register, Welcome } from './pages/Auth'
import {
  PHome, PProfile, PEnrollment, PPayments, PNewPayment, PQR,
  PAttendance, PDocuments, PAnnouncements, PEvents,
} from './pages/Participant'
import {
  AdminDashboard, AdminParticipants, AdminParticipantDetail, AdminEnrollments,
  AdminPayments, AdminValidation,
} from './pages/Admin'
import {
  AdminScanner, AdminEvents, AdminAttendance, AdminAbsences, AdminDocuments,
  AdminAnnouncements, AdminReports, AdminUsers, AdminSettings, AdminAudit,
} from './pages/AdminOps'
import { Splash } from './components/Splash'

function Booting() {
  return <Splash />
}

function HomeRedirect() {
  const { user, ready } = useStore()
  if (!ready) return <Booting />
  if (!user) return <Welcome />
  if (user.profile.role === 'participante') return <Navigate to="/app" replace />
  if (user.profile.role === 'controlador') return <Navigate to="/escaner" replace />
  return <Navigate to="/admin" replace />
}

function Guard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user, ready } = useStore()
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  if (!ready) return <Booting />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!roles.includes(user.profile.role)) {
    return <Navigate to={user.profile.role === 'participante' ? '/app' : '/admin'} replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />

          <Route path="/app" element={<Guard roles={['participante']}><Shell /></Guard>}>
            <Route index element={<PHome />} />
            <Route path="perfil" element={<PProfile />} />
            <Route path="inscripcion" element={<PEnrollment />} />
            <Route path="pagos" element={<PPayments />} />
            <Route path="pagos/nuevo" element={<PNewPayment />} />
            <Route path="qr" element={<PQR />} />
            <Route path="asistencias" element={<PAttendance />} />
            <Route path="documentos" element={<PDocuments />} />
            <Route path="comunicados" element={<PAnnouncements />} />
            <Route path="eventos" element={<PEvents />} />
          </Route>

          <Route
            path="/admin"
            element={<Guard roles={['superadmin', 'admin', 'controlador']}><Shell /></Guard>}
          >
            <Route index element={<AdminDashboard />} />
            <Route path="participantes" element={<AdminParticipants />} />
            <Route path="participantes/:id" element={<AdminParticipantDetail />} />
            <Route path="inscripciones" element={<AdminEnrollments />} />
            <Route path="pagos" element={<AdminPayments />} />
            <Route path="validacion" element={<AdminValidation />} />
            <Route path="escaner" element={<AdminScanner />} />
            <Route path="eventos" element={<AdminEvents />} />
            <Route path="asistencias" element={<AdminAttendance />} />
            <Route path="faltas" element={<AdminAbsences />} />
            <Route path="documentos" element={<AdminDocuments />} />
            <Route path="comunicados" element={<AdminAnnouncements />} />
            <Route path="reportes" element={<AdminReports />} />
            <Route path="usuarios" element={<AdminUsers />} />
            <Route path="configuracion" element={<AdminSettings />} />
            <Route path="auditoria" element={<AdminAudit />} />
          </Route>

          <Route path="/escaner" element={<Guard roles={['superadmin', 'admin', 'controlador']}><Shell /></Guard>}>
            <Route index element={<AdminScanner />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </StoreProvider>
  )
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<any>(null)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvent(e) }
    window.addEventListener('beforeinstallprompt', h)
    window.addEventListener('appinstalled', () => setInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  const install = async () => {
    if (!event) return
    event.prompt()
    const res = await event.userChoice
    if (res?.outcome === 'accepted') setInstalled(true)
    setEvent(null)
  }
  return { canInstall: !!event, install, installed }
}
