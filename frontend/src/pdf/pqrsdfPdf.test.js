import { describe, it, expect } from 'vitest'
import { construirPdfPqrsdf, datosDesdeRadicado } from './pqrsdfPdf.js'

// Etiquetas tal como las tiene hoy el formulario "Portal PQRSF" del sitio.
const radicado = {
  radicado: 'TTN-2026-0014',
  fecha: '2026-10-22 17:19:00',
  resumen: { correo: 'ana@correo.com' },
  campos: [
    { etiqueta: 'Tipo de Solicitud', valor: 'Queja' },
    { etiqueta: 'Nombre Del Solicitante', valor: 'Ana María Pérez Gómez' },
    { etiqueta: 'Tipo de documento', valor: 'Cédula de extranjería (CE)' },
    { etiqueta: 'Número de identificación', valor: '1075000000' },
    { etiqueta: 'Correo Electronico', valor: 'ana@correo.com' },
    { etiqueta: 'Direccion', valor: 'Calle 2 Sur # 7' },
    { etiqueta: 'Numero de Telefono', valor: '3101234567' },
    { etiqueta: 'Ciudad', valor: 'Neiva - Huila' },
    { etiqueta: 'Tipo de usuario', valor: 'Conductor' },
    { etiqueta: '¿Es victima de discriminación?', valor: 'Sí' },
    { etiqueta: 'Si respondió Sí, ¿cuál?', valor: 'Por mi género' },
    { etiqueta: 'Servicio donde se origina la no conformidad', valor: 'Baños' },
    { etiqueta: 'Presentada mediante', valor: 'Personalmente' },
    { etiqueta: 'Detalles del PQR: Asunto/Referencia', valor: 'Cobro indebido' },
    { etiqueta: 'Ingrese su inquietud/comentario', valor: 'Texto largo. '.repeat(300) },
  ],
}

describe('PQRSDF FO-AC-02', () => {
  it('prellena con el radicado y el funcionario, sin firmas', () => {
    const d = datosDesdeRadicado(radicado, { nombre: 'Laura R.', cargo: 'Atención al cliente' })
    expect(d).toMatchObject({
      numero: 'TTN-2026-0014',
      tipo: 'queja',
      tipoDoc: 'CE',
      cedula: '1075000000',
      correo: 'ana@correo.com',
      direccion: 'Calle 2 Sur # 7',
      telefono: '3101234567',
      calidad: 'conductor',
      discriminacion: 'si',
      cualDiscriminacion: 'Por mi género',
      servicio: 'Baños',
      medio: 'personalmente',
      nombres: 'Ana María',
      apellidos: 'Pérez Gómez',
      funcionario: 'Laura R. - Atención al cliente',
      direccion: 'Calle 2 Sur # 7, Neiva - Huila',
    })
    expect(d.descripcion.startsWith('Asunto: Cobro indebido\nTexto largo.')).toBe(true)
  })
  it('reconoce cada opción tal como la guarda el sitio', () => {
    const con = (etiqueta, valor) => datosDesdeRadicado({ campos: [{ etiqueta, valor }] }, null)
    const casos = [
      ['Tipo de Solicitud', 'tipo', { Petición: 'peticion', Queja: 'queja', Reclamo: 'reclamo', Sugerencia: 'sugerencia', Denuncia: 'denuncia', Felicitación: 'felicidades' }],
      ['Tipo de documento', 'tipoDoc', { 'Cédula de ciudadanía (CC)': 'CC', 'Cédula de extranjería (CE)': 'CE', 'Tarjeta de identidad (TI)': 'TI', Pasaporte: 'PA' }],
      ['Tipo de usuario', 'calidad', { 'Empresa transportadora': 'empresa', Conductor: 'conductor', Copropietario: 'copropietario', Usuario: 'usuario' }],
      ['Presentada mediante', 'medio', { Llamada: 'llamada', Personalmente: 'personalmente', Escrita: 'escrita' }],
      ['¿Es víctima de discriminación?', 'discriminacion', { Sí: 'si', No: 'no' }],
    ]
    for (const [etiqueta, campo, valores] of casos) {
      for (const [valor, esperado] of Object.entries(valores)) expect(con(etiqueta, valor)[campo]).toBe(esperado)
    }
  })
  it('no imprime "?" por comillas tipográficas ni emojis', async () => {
    const pdf = await construirPdfPqrsdf({ numero: 'X', descripcion: 'Cobro “indebido” – taquilla… 😡' })
    const texto = pdf.output()
    expect(texto).toContain('Cobro "indebido" - taquilla...')
    expect(texto).not.toContain('taquilla...?')
  })
  it('genera 2 hojas y una más si la descripción no cabe', async () => {
    expect((await construirPdfPqrsdf({ numero: 'X', descripcion: 'corta' })).internal.getNumberOfPages()).toBe(2)
    const largo = await construirPdfPqrsdf(datosDesdeRadicado(radicado, null))
    expect(largo.internal.getNumberOfPages()).toBeGreaterThanOrEqual(3)
  })
})
