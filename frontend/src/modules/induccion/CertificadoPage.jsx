import { jsPDF } from 'jspdf'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PartyPopper, GraduationCap, ScrollText } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Btn, Card, ErrorMsg, Field, Input } from '../../components/ui.jsx'
import { ENCUESTAS, LOGO_TERMINAL, MODULOS } from './induccionData.js'
import { getPuntaje, reiniciarProgreso } from './induccionProgress.js'

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export default function CertificadoPage() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState(false)

  async function generarCertificado(e) {
    e.preventDefault()
    setError('')

    const nombreLimpio = nombre.trim()
    const cedulaLimpia = cedula.trim()
    if (!nombreLimpio || !cedulaLimpia) {
      setError('Por favor completa tu nombre y cédula.')
      return
    }

    setGenerando(true)
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      pdf.setFillColor(247, 247, 247)
      pdf.rect(0, 0, 297, 210, 'F')

      const margin = 15
      const innerW = 297 - margin * 2
      const innerH = 210 - margin * 2
      pdf.setDrawColor(0, 91, 150)
      pdf.setLineWidth(2)
      pdf.rect(margin, margin, innerW, innerH)

      let logoH = 0
      try {
        const img = await cargarImagen(LOGO_TERMINAL)
        const logoW = 35
        logoH = (img.height / img.width) * logoW
        const logoY = margin + 6
        pdf.addImage(img, 'PNG', 148.5 - logoW / 2, logoY, logoW, logoH)
      } catch {
        logoH = 0
      }

      const logoY = margin + 6
      pdf.setFont('times', 'bold')
      pdf.setFontSize(14)
      pdf.setTextColor(0, 91, 150)
      pdf.text('CERTIFICADO DE INDUCCIÓN INSTITUCIONAL', 148.5, logoY + logoH + 10, { align: 'center' })

      pdf.setFont('times', 'italic')
      pdf.setFontSize(11)
      pdf.setTextColor(0, 0, 0)
      pdf.text(`Otorgado a: ${nombreLimpio}`, 148.5, logoY + logoH + 22, { align: 'center' })

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text(`Cédula: ${cedulaLimpia}`, 148.5, logoY + logoH + 30, { align: 'center' })

      pdf.setFontSize(9.5)
      pdf.text(
        'Por haber completado satisfactoriamente el proceso de inducción institucional del',
        148.5,
        logoY + logoH + 40,
        { align: 'center' }
      )
      pdf.text('Terminal de Transportes de Neiva S.A.', 148.5, logoY + logoH + 46, { align: 'center' })

      const startX = margin + 35
      let startY = logoY + logoH + 64
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.setTextColor(0, 91, 150)
      pdf.text('Resultados por módulo:', startX, startY)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(0, 0, 0)
      startY += 6

      let total = 0
      const maxTotal = MODULOS.length * 5

      MODULOS.forEach((m) => {
        let valor = getPuntaje(usuario?.id_usuario, m.id)
        if (!valor || !valor.includes('/')) valor = 'No completado'
        else {
          const [p] = valor.split('/').map((n) => parseInt(n.trim(), 10) || 0)
          total += p
        }
        pdf.text(`${m.titulo}: ${valor}`, startX, startY)
        startY += 5
      })

      const calificacion = Math.round((total / maxTotal) * 100)
      const concepto = calificacion >= 70 ? 'Aprobado' : 'No Aprobado'

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9.5)
      pdf.setTextColor(0, 120, 60)
      pdf.text(`Puntaje total: ${total}/${maxTotal}`, startX, startY + 5)
      pdf.text(`Calificación final: ${calificacion}% (${concepto})`, startX, startY + 11)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(60)
      const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' })
      pdf.text(`Fecha de emisión: ${fecha}`, startX, startY + 22)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(0, 0, 0)
      const firmaY = margin + innerH - 15
      pdf.text('Aprobó:', 235, firmaY)
      pdf.setLineWidth(0.3)
      pdf.line(250, firmaY - 1, 280, firmaY - 1)

      pdf.setFont('helvetica', 'italic')
      pdf.setFontSize(7.5)
      pdf.setTextColor(100)
      const footerY = margin + innerH - 4
      pdf.text(
        'Este certificado es válido únicamente para la empresa Terminal de Transportes de Neiva S.A.',
        margin + innerW - 2,
        footerY,
        { align: 'right' }
      )

      pdf.save(`Certificado_Induccion_${nombreLimpio.replace(/\s+/g, '_')}.pdf`)

      reiniciarProgreso(usuario?.id_usuario, MODULOS.length)
      setTimeout(() => navigate('/induccion'), 2000)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card className="text-center">
        <img src={LOGO_TERMINAL} alt="Logo Terminal" className="mx-auto h-20 w-20 rounded-lg bg-white/90 object-contain p-2" />
        <h1 className="mt-3 flex items-center justify-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <PartyPopper className="h-5 w-5" aria-hidden="true" /> ¡Felicitaciones!
        </h1>
        <h2 className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">Has completado exitosamente tu inducción</h2>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Bienvenido(a) nuevamente a <strong className="text-slate-700 dark:text-slate-200">Terminal de Transportes de Neiva S.A.</strong>
        </p>

        <p className="mt-5 text-sm font-medium text-slate-700 dark:text-slate-200">Por favor, resuelve las siguientes encuestas antes de descargar tu certificado:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {ENCUESTAS.map((enc) => (
            <a key={enc.href} href={enc.href} target="_blank" rel="noreferrer" className="panel-btn-secundario rounded-lg px-4 py-2 text-sm">
              {enc.label}
            </a>
          ))}
        </div>

        <form onSubmit={generarCertificado} className="mt-6 space-y-3 text-left">
          <h3 className="flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-cyan-700 dark:text-cyan-300">
            <GraduationCap className="h-4 w-4" aria-hidden="true" /> Genera tu certificado
          </h3>
          <p className="text-center text-xs text-slate-500">Ingresa tus datos y genera tu certificado con los puntajes reales de tus módulos.</p>

          <ErrorMsg>{error}</ErrorMsg>

          <Field label="Nombre completo">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" required />
          </Field>
          <Field label="Cédula">
            <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Cédula" required />
          </Field>

          <div className="flex justify-center pt-2">
            <Btn type="submit" disabled={generando} className="inline-flex items-center gap-1.5">
              {!generando && <ScrollText className="h-4 w-4" aria-hidden="true" />}
              {generando ? 'Generando…' : 'Generar Certificado'}
            </Btn>
          </div>
        </form>

        <p className="mt-5 text-xs text-slate-500">Después de descargar tu certificado, tu progreso se reiniciará y volverás al inicio de Inducción.</p>
      </Card>
    </div>
  )
}
