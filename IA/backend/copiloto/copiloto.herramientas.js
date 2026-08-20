import { Type } from '@google/genai'
import ReporteDano from '../../models/ReporteDano.js'
import * as requerimientosService from '../requerimientos/requerimientos.service.js'
import { validarItemsCompra, normalizarItemsCompra } from '../requerimientos/requerimientos.service.js'
import { ErrorValidacion } from '../../utils/errores.js'
import * as ausenciasService from '../ausencias/ausencias.service.js'
import { calcularResumen } from '../operacion/dashboard.service.js'
import { estaModuloActivo } from '../sistema/sistema.service.js'
import { buscarWikipedia, consultarClima } from './copiloto.internet.js'
import { buscarWeb } from './copiloto.busqueda.js'
import { horaActual, fechaActual } from './copiloto.tiempo.js'
import { convertirMoneda, tasaCambio } from './copiloto.divisas.js'
import { calcular } from './copiloto.calculadora.js'
import { destinosDisponibles, resolverDestino } from './copiloto.navegacion.js'
import { recordarHecho, olvidarHecho, obtenerHechos } from './copiloto.memoria.js'
import { cacheHerramientas } from './copiloto.cache.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

// Techo de resultados por herramienta: mantiene la respuesta liviana en
// tokens (y en costo, aunque Gemini se use en capa gratuita) — el copiloto
// responde preguntas puntuales ("¿cómo va mi requerimiento?"), no reemplaza
// las bandejas completas de cada módulo.
const LIMITE_LISTA = 15

function recortar(lista) {
  return lista.slice(0, LIMITE_LISTA)
}

// Mismo criterio que danos.controller.js#esTecnicoPuro: un técnico que solo
// ejecuta (no gestiona) NO puede reportar daños, así que preguntarle al
// copiloto por "los daños que reporté" no tiene sentido para él.
function esTecnicoPuro(usuario) {
  return (
    usuario.permisos?.has('mantenimiento:ejecutar') === true &&
    !usuario.esSuperAdmin &&
    !usuario.permisos?.has('danos:gestionar')
  )
}

// Mismo criterio que dashboard.service.js: Bodega no participa del flujo de
// daños en absoluto (ni reporta ni gestiona).
function esBodega(usuario) {
  return usuario.rol?.slug === 'bodega' && !usuario.esSuperAdmin
}

// Herramientas de datos del Terminal: SOLO LECTURA y acotadas a los datos DEL
// USUARIO que pregunta (o a un resumen ya filtrado por su propio permiso, como
// el dashboard) — nunca a los de otra persona, y ninguna aprueba, rechaza ni
// modifica nada. `usuario` queda cerrado en cada `ejecutar` por clausura, así
// agregar una herramienta nueva es un único punto de cambio en este archivo:
// no hay forma de que el modelo pida el ID de otro usuario y reciba datos
// suyos, porque el filtro de propiedad nunca sale de las manos del backend.
//
// Además cada herramienta declara su alcance, y `construirHerramientas` las
// filtra ANTES de mandárselas al modelo:
//  - `modulo`: si el Super Admin lo apagó en /sistema/modulos, la herramienta
//    ni siquiera existe para el modelo (mismo gate que requiereModuloActivo
//    aplica al resto de la app; sin esto el chat seguía respondiendo de un
//    módulo apagado).
//  - `permiso`: código RBAC exigido ("usuarios:gestionar"). Un array significa
//    "cualquiera de estos". Es la forma DECLARATIVA, preferible a `disponible`
//    cuando el criterio es un permiso y no una regla de rol compuesta.
//  - `disponible(usuario)`: escape para las reglas que no son un permiso
//    (p. ej. "técnico puro no reporta daños"), que no se pueden expresar como
//    un código RBAC porque son la AUSENCIA de uno.
//  - `requiereConfirmacion`: la herramienta NO se ejecuta cuando el modelo la
//    pide; se le devuelve al usuario para que confirme (ver copiloto.
//    confirmaciones.js). El modelo nunca dispara la acción por su cuenta.
//  - `auditar`: deja rastro en RegistroAuditoria. No se marca en las consultas
//    de solo lectura: una fila por cada "¿qué tengo pendiente?" ahogaría el
//    registro que se usa para cumplimiento real.
//
// Un modelo no puede invocar una herramienta que nunca vio declarada, así que
// esto es una restricción real, no una instrucción que pueda ignorar.
function catalogoHerramientas(usuario, contexto = {}) {
  return [
    {
      declaracion: {
        name: 'resumen_dashboard',
        description:
          'Devuelve el resumen de tarjetas del panel principal del usuario que pregunta: conteos de pendientes en cada módulo al que tiene acceso (daños, requerimientos, ausencias, mantenimiento, etc.), igual a lo que ve en su Dashboard.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      ejecutar: async () => {
        const { tarjetas } = await calcularResumen(usuario)
        return tarjetas
      },
    },
    {
      modulo: 'requerimientos',
      declaracion: {
        name: 'mis_requerimientos',
        description:
          'Lista los requerimientos de compra/servicio que el usuario que pregunta ha solicitado, con su estado actual. Útil para responder "¿cómo va mi requerimiento?" o "¿qué tengo pendiente?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            estado: {
              type: Type.STRING,
              description:
                'Filtra por estado exacto: pendiente_financiero, pendiente_bodega, rechazado. Opcional, si no se indica devuelve todos.',
            },
          },
        },
      },
      ejecutar: async ({ estado } = {}) => {
        const lista = await requerimientosService.listarMios(usuario)
        const filtrada = estado ? lista.filter((r) => r.estado === estado) : lista
        return recortar(filtrada).map((r) => ({
          id: String(r._id),
          tipo: r.tipo,
          estado: r.estado,
          estadoBodega: r.estado === 'pendiente_bodega' ? r.bodega?.estado : undefined,
          areaOProceso: r.areaOProceso,
          creado: r.createdAt,
        }))
      },
    },
    {
      modulo: 'requerimientos',
      // Crear un requerimiento es capacidad universal (ver requerimientos.
      // routes.js) — cualquier usuario autenticado puede pedir uno.
      //
      // ÚNICA herramienta de este archivo que no es de solo lectura, y aun
      // así NO ESCRIBE NADA en la base de datos: arma y valida un borrador
      // con las mismas reglas que crearRequerimiento(), pero el modelo no
      // tiene forma de guardarlo — el botón "Confirmar y enviar" que ve el
      // usuario llama a un endpoint aparte (POST /copiloto/requerimientos/
      // compra) que nunca pasa por Gemini. Así, sin importar qué decida el
      // modelo o qué tan convencido esté de que el usuario ya confirmó, es
      // imposible que cree un requerimiento real por su cuenta.
      declaracion: {
        name: 'preparar_requerimiento_compra',
        description:
          'Arma un BORRADOR de requerimiento de compra con los productos que pida el usuario. NO lo crea ni lo envía a nadie — solo prepara un resumen para que el usuario lo revise y confirme con un botón en la interfaz. Úsala en cuanto tengas al menos un producto con su cantidad; si falta el área/proceso o la fecha de algún ítem, usa un valor razonable (fecha de hoy) y dile al usuario qué asumiste para que lo corrija si hace falta.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            areaOProceso: { type: Type.STRING, description: 'Área o proceso que solicita, si el usuario lo mencionó.' },
            items: {
              type: Type.ARRAY,
              description: 'Uno por cada producto a comprar.',
              items: {
                type: Type.OBJECT,
                properties: {
                  descripcionProducto: { type: Type.STRING },
                  cantidad: { type: Type.NUMBER },
                  destino: { type: Type.STRING, description: 'Opcional: para qué o dónde se usará.' },
                  fechaSolicitud: { type: Type.STRING, description: 'Fecha en formato YYYY-MM-DD. Si no la dan, usa la fecha de hoy.' },
                },
                required: ['descripcionProducto', 'cantidad'],
              },
            },
          },
          required: ['items'],
        },
      },
      ejecutar: async ({ areaOProceso, items } = {}) => {
        if (!Array.isArray(items) || items.length === 0) {
          return { error: 'Debes indicar al menos un producto con su cantidad' }
        }
        // Mismo criterio de "hoy" que usaría cualquiera llenando el formulario
        // a mano el mismo día — el usuario puede corregirlo por chat si la
        // fecha real es otra, y eso arma un borrador nuevo.
        const hoy = new Date().toISOString().slice(0, 10)
        const itemsConFecha = items.map((it) => ({ ...it, fechaSolicitud: it.fechaSolicitud || hoy }))
        try {
          validarItemsCompra(itemsConFecha)
        } catch (err) {
          // ErrorValidacion trae un mensaje pensado para mostrarse tal cual;
          // cualquier otro tipo de error no debería poder llegar aquí, pero se
          // cubre iguial para no dejar una excepción sin capturar.
          return { error: err instanceof ErrorValidacion ? err.message : 'No se pudo armar el borrador' }
        }
        const normalizados = normalizarItemsCompra(itemsConFecha)
        return {
          borrador: true,
          tipo: 'compra',
          areaOProceso: areaOProceso ? String(areaOProceso).trim() : '',
          items: normalizados.map((it) => ({
            descripcionProducto: it.descripcionProducto,
            cantidad: it.cantidad,
            destino: it.destino,
            fechaSolicitud: it.fechaSolicitud.toISOString().slice(0, 10),
          })),
          mensaje:
            'Borrador armado. Descríbeselo brevemente al usuario y recuérdale que debe presionar "Confirmar y enviar" en la tarjeta para que quede guardado — todavía NO se ha creado ni se ha notificado a nadie.',
        }
      },
    },
    {
      modulo: 'danos',
      // Reportar daños es capacidad universal MENOS para técnico puro y
      // Bodega, que no participan de ese flujo.
      disponible: (u) => !esTecnicoPuro(u) && !esBodega(u),
      declaracion: {
        name: 'mis_reportes_dano',
        description:
          'Lista los reportes de daño/novedad que el usuario que pregunta ha reportado, con su estado y quién lo tiene asignado. Útil para "¿en qué va el daño que reporté?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            estado: {
              type: Type.STRING,
              description:
                'Filtra por estado exacto: pendiente, asignado, en_proceso, en_espera, resuelto, cancelado. Opcional.',
            },
          },
        },
      },
      ejecutar: async ({ estado } = {}) => {
        const filtro = { reportadoPor: usuario.id_usuario }
        if (estado) filtro.estado = estado
        const reportes = await ReporteDano.find(filtro)
          .populate({ path: 'asignadoA', select: 'nombre' })
          .sort({ createdAt: -1 })
          .limit(LIMITE_LISTA)
          .lean()
        return reportes.map((r) => ({
          id: String(r._id),
          tipo: r.tipo,
          estado: r.estado,
          prioridad: r.prioridad,
          descripcion: r.descripcion,
          asignadoA: r.asignadoA?.nombre || null,
          creado: r.createdAt,
        }))
      },
    },
    {
      modulo: 'ausencias',
      declaracion: {
        name: 'mis_ausencias',
        description:
          'Lista las solicitudes de vacaciones, permisos o incapacidades del usuario que pregunta, con su estado. Útil para "¿me aprobaron las vacaciones?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            estado: {
              type: Type.STRING,
              description: 'Filtra por estado exacto: pendiente, aprobada, rechazada, cancelada. Opcional.',
            },
          },
        },
      },
      ejecutar: async ({ estado } = {}) => {
        const lista = await ausenciasService.listarMias(usuario)
        const filtrada = estado ? lista.filter((a) => a.estado === estado) : lista
        return recortar(filtrada).map((a) => ({
          id: String(a._id),
          tipo: a.tipo,
          estado: a.estado,
          fechaInicio: a.fechaInicio,
          fechaFin: a.fechaFin,
          diasHabiles: a.diasHabiles,
        }))
      },
    },
    {
      modulo: 'ausencias',
      // ── ÚNICA herramienta destructiva registrada hoy ────────────────────
      // Existe además de por su utilidad, porque un mecanismo de confirmación
      // que ninguna herramienta usa es un mecanismo que nadie sabe si funciona.
      //
      // Se eligió esta y no "eliminar usuario" por dónde queda el daño si algo
      // sale mal: `cancelarAusencia` rechaza en el propio servicio cualquier
      // ausencia que no sea del solicitante y cualquiera que no esté
      // pendiente, así que el peor caso posible es que alguien cancele una
      // solicitud SUYA que todavía nadie había respondido. Una herramienta de
      // borrado administrativo tendría el mismo mecanismo y un peor caso
      // incomparable; si se quiere, se agrega igual que esta, pero es una
      // decisión de producto aparte.
      requiereConfirmacion: true,
      auditar: true,
      descripcionConfirmacion: async ({ id }) => {
        // Se lee la ausencia para que el botón diga QUÉ se va a cancelar. Un
        // "¿confirmas la acción?" sin objeto es justo lo que hace que la gente
        // pulse sí por inercia.
        const lista = await ausenciasService.listarMias(usuario)
        const a = lista.find((x) => String(x._id) === String(id))
        if (!a) return 'Se cancelará la solicitud de ausencia indicada. No se puede deshacer.'
        const desde = new Date(a.fechaInicio).toISOString().slice(0, 10)
        const hasta = new Date(a.fechaFin).toISOString().slice(0, 10)
        return `Se cancelará tu solicitud de ${a.tipo?.replace(/_/g, ' ')} del ${desde} al ${hasta}. No se puede deshacer.`
      },
      declaracion: {
        name: 'cancelar_mi_ausencia',
        description:
          'Cancela una solicitud de ausencia PROPIA que siga pendiente. Necesitas el id, que te da mis_ausencias: consúltala primero si no lo tienes. NO se ejecuta al pedirla — queda esperando que el usuario confirme con un botón, así que nunca digas que ya está cancelada.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: 'El id de la ausencia, tal como lo devuelve mis_ausencias.' },
          },
          required: ['id'],
        },
      },
      // Solo corre por el camino de confirmación (ver ejecutarConfirmada): el
      // bucle del modelo nunca llega aquí porque `requiereConfirmacion` lo
      // detiene antes. El servicio revalida propiedad y estado por su cuenta.
      ejecutar: async ({ id }) => {
        const actualizada = await ausenciasService.cancelarAusencia(id, usuario)
        return { cancelada: true, id: String(actualizada._id ?? id), estado: actualizada.estado }
      },
    },
    // Únicas dos herramientas que NO consultan datos del Terminal: dan acceso a
    // "cosas cotidianas" (clima, cultura general) vía APIs públicas gratuitas,
    // sin key ni cuenta — no Google Search (Gemini ya no lo da gratis para este
    // modelo, factura por búsqueda) ni scraping (frágil y contra los términos
    // de uso). Sin `modulo`: son universales, no dependen de RBAC del ERP.
    {
      declaracion: {
        name: 'buscar_wikipedia',
        description:
          'Busca un resumen enciclopédico en Wikipedia en español: definiciones, personas, lugares, historia, cultura general. NO sirve para datos en tiempo real (usa consultar_clima para el clima) ni para nada del Terminal de Transporte (usa las otras herramientas para eso).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            consulta: { type: Type.STRING, description: 'Qué buscar, ej. "río Magdalena" o "Simón Bolívar".' },
          },
          required: ['consulta'],
        },
      },
      ejecutar: async ({ consulta }) => buscarWikipedia(consulta),
    },
    {
      declaracion: {
        name: 'consultar_clima',
        description: 'Devuelve el clima actual (temperatura, humedad, condición) de una ciudad. Útil para "¿qué clima hace en...?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ciudad: { type: Type.STRING, description: 'Nombre de la ciudad, ej. "Neiva" o "Bogotá".' },
          },
          required: ['ciudad'],
        },
      },
      ejecutar: async ({ ciudad }) => consultarClima(ciudad),
    },
    {
      declaracion: {
        name: 'buscar_en_internet',
        description:
          'Busca información ACTUAL en la web: noticias, resultados, precios, quién ocupa un cargo hoy, versiones de un producto, cualquier cosa posterior a tu entrenamiento o que pueda haber cambiado. Úsala cuando la respuesta dependa de datos de hoy y NO cuando sea conocimiento general estable (para definiciones usa buscar_wikipedia, y para el Terminal usa las herramientas del ERP). Cita las fuentes que devuelva.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            consulta: {
              type: Type.STRING,
              description: 'Qué buscar, redactado como se escribiría en un buscador.',
            },
          },
          required: ['consulta'],
        },
      },
      ejecutar: async ({ consulta }) => buscarWeb(consulta),
    },
    {
      declaracion: {
        name: 'hora_actual',
        description:
          'Hora actual real, tomada del servidor. Úsala SIEMPRE que pregunten la hora — no la deduzcas ni la estimes. Sin `lugar` responde la del Terminal (Colombia).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            lugar: {
              type: Type.STRING,
              description: 'Ciudad, país o zona IANA. Opcional, ej. "Nueva York" o "Europe/Madrid".',
            },
          },
        },
      },
      ejecutar: async ({ lugar } = {}) => horaActual(lugar),
    },
    {
      declaracion: {
        name: 'fecha_actual',
        description:
          'Fecha de hoy con día de la semana, tomada del servidor. Úsala para "¿qué día es hoy?" y para resolver fechas relativas ("el lunes", "fin de mes") antes de calcular nada.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            lugar: { type: Type.STRING, description: 'Ciudad, país o zona IANA. Opcional.' },
          },
        },
      },
      ejecutar: async ({ lugar } = {}) => fechaActual(lugar),
    },
    {
      declaracion: {
        name: 'calcular',
        description:
          'Resuelve una operación aritmética con precisión exacta. Úsala SIEMPRE que haya números que operar (porcentajes, sumas de dinero, descuentos) en vez de calcular mentalmente: tú te equivocas con cifras largas y esto no. Acepta + - * / ^, paréntesis, porcentajes ("19% de 2000000") y magnitudes en español ("2 millones").',
        parameters: {
          type: Type.OBJECT,
          properties: {
            expresion: {
              type: Type.STRING,
              description: 'La operación, ej. "250 * 38" o "19% de 2 millones" o "(2000000 - 700000) / 12".',
            },
          },
          required: ['expresion'],
        },
      },
      ejecutar: async ({ expresion }) => calcular(expresion),
    },
    {
      declaracion: {
        name: 'convertir_moneda',
        description:
          'Tasa de cambio actual entre dos monedas y, si das `cantidad`, la conversión ya hecha. Úsala para "¿cuánto está el dólar?" o "100 dólares en pesos". Es tasa de REFERENCIA del mercado, no la TRM oficial: dilo si la respuesta se va a usar para algo contable.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            de: { type: Type.STRING, description: 'Moneda de origen: "dólares", "USD", "euros"…' },
            a: { type: Type.STRING, description: 'Moneda de destino. Si no la dicen, usa "COP" (pesos colombianos).' },
            cantidad: { type: Type.NUMBER, description: 'Cuánto convertir. Opcional: sin ella devuelve solo la tasa.' },
          },
          required: ['de', 'a'],
        },
      },
      ejecutar: async ({ de, a, cantidad } = {}) =>
        cantidad === undefined || cantidad === null ? tasaCambio(de, a) : convertirMoneda(cantidad, de, a),
    },
    // ── Acción sobre la interfaz ────────────────────────────────────────────
    // Única herramienta que no devuelve datos sino que hace ACTUAR al panel.
    // No navega ella: devuelve una ruta que el frontend ejecuta (ver
    // copiloto.service.js, evento {tipo:'navegacion'}). El modelo no toca el
    // navegador — propone un destino de una lista que ya se filtró por los
    // permisos reales de quien pregunta.
    {
      // Se audita, a diferencia de las consultas: es una ACCIÓN sobre la
      // sesión del usuario, y el registro es lo que permite responder después
      // "¿por qué se me abrió esta pantalla?" o revisar qué hizo el asistente.
      auditar: true,
      declaracion: {
        name: 'abrir_seccion',
        description:
          `Abre una sección del panel en la pantalla del usuario. Úsala cuando pidan ir, abrir, mostrar o llevar a algún lado ("abre los reportes", "llévame a mis vacaciones"). Secciones disponibles PARA ESTE USUARIO (usa la clave exacta):\n${contexto.catalogoTexto || '(ninguna)'}\nSi lo que piden no está en esta lista, NO inventes una clave: dile que no tiene acceso a esa sección o que no existe.`,
        parameters: {
          type: Type.OBJECT,
          properties: {
            seccion: { type: Type.STRING, description: 'La clave exacta de la lista de arriba.' },
          },
          required: ['seccion'],
        },
      },
      // El resultado lleva `navegacion: true`: es la marca que lee
      // responderStream para emitir el evento de UI además de dárselo al
      // modelo. Se vuelve a resolver contra `destinosDisponibles` aunque la
      // clave saliera del catálogo declarado, porque el permiso se verifica al
      // EJECUTAR, no solo al declarar (mismo principio que el resto del
      // archivo).
      ejecutar: async ({ seccion }) => {
        const destino = await resolverDestino(seccion, usuario)
        if (destino.error) return destino
        return { navegacion: true, ...destino, mensaje: `Abriendo ${destino.titulo}.` }
      },
    },
    // ── Memoria larga ───────────────────────────────────────────────────────
    // Las únicas dos herramientas que ESCRIBEN algo persistente, y lo que
    // escriben son notas del propio usuario sobre sí mismo — no datos del
    // Terminal. No hay forma de que toquen un requerimiento, una ausencia ni
    // un daño: `recordarHecho` solo sabe insertar pares clave/valor en el
    // documento de memoria de QUIEN pregunta (el id sale de la clausura, no de
    // un argumento del modelo), así que ni alucinando un id ajeno podría
    // escribir en la memoria de otra persona.
    {
      declaracion: {
        name: 'recordar',
        description:
          'Guarda un dato que el usuario te pide recordar para conversaciones futuras (su área habitual, cómo prefiere las respuestas, un proveedor que siempre usa). Úsala SOLO cuando la persona lo pida explícitamente ("acuérdate de que…", "de ahora en adelante…"), nunca por tu cuenta a partir de un comentario de paso.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clave: {
              type: Type.STRING,
              description: 'Etiqueta corta del dato, en minúsculas, ej. "area habitual" o "formato de respuesta".',
            },
            valor: { type: Type.STRING, description: 'El dato a recordar, en una frase.' },
          },
          required: ['clave', 'valor'],
        },
      },
      ejecutar: async ({ clave, valor }) => recordarHecho(usuario.id_usuario, clave, valor),
    },
    {
      declaracion: {
        name: 'olvidar',
        description:
          'Borra un dato guardado con `recordar`. Úsala cuando el usuario pida que dejes de recordar algo. Si no sabes la clave exacta, primero consulta con `que_recuerdas`.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clave: { type: Type.STRING, description: 'La clave exacta del dato a borrar.' },
          },
          required: ['clave'],
        },
      },
      ejecutar: async ({ clave }) => olvidarHecho(usuario.id_usuario, clave),
    },
    {
      declaracion: {
        name: 'que_recuerdas',
        description:
          'Lista todo lo que tienes guardado sobre este usuario. Úsala si te preguntan qué recuerdas de ellos o si necesitas la clave exacta de un dato antes de borrarlo.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      ejecutar: async () => obtenerHechos(usuario.id_usuario),
    },
  ]
}

// Herramientas de SOLO LECTURA cuyo resultado se puede reutilizar durante unos
// segundos. Es una lista explícita y no una bandera por defecto: olvidarse de
// marcar una herramienta nueva como cacheable solo la deja lenta, mientras que
// cachear por descuido una que escribe (recordar/olvidar) haría que la segunda
// llamada no se ejecutara nunca. El error barato es el correcto por defecto.
// `hora_actual` NO está aquí, y es el caso que mejor explica el criterio:
// cachear la hora veinte segundos significa responder una hora incorrecta.
// `convertir_moneda` y `buscar_en_internet` tampoco, porque cachean por dentro
// con un TTL propio y mucho más largo (ver copiloto.divisas.js /
// copiloto.busqueda.js) — meterlas aquí sería cachear lo ya cacheado.
// `calcular` es una función pura y barata: la caché costaría más que ejecutarla.
const CACHEABLES = new Set([
  'resumen_dashboard',
  'mis_requerimientos',
  'mis_reportes_dano',
  'mis_ausencias',
  'buscar_wikipedia',
  'consultar_clima',
  'fecha_actual',
])

// Envuelve `ejecutar` con la caché de resultados.
//
// La clave lleva el ID DEL USUARIO por delante, y eso no es un detalle: sin él
// dos personas distintas preguntando "mis requerimientos" compartirían entrada
// y la segunda vería los datos de la primera. Es la forma más fácil de
// convertir una caché en una fuga de datos, así que la clave se arma aquí, en
// un solo sitio, y no en cada herramienta.
//
// Wikipedia y el clima no dependen del usuario, pero se cachean con la misma
// clave igual: el desperdicio es una entrada por usuario en un Map acotado, y
// a cambio no hay que razonar caso por caso sobre si una herramienta devuelve
// datos personales o públicos.
function conCache(herramienta, usuario) {
  if (!CACHEABLES.has(herramienta.declaracion.name)) return herramienta
  const ejecutarReal = herramienta.ejecutar
  return {
    ...herramienta,
    ejecutar: (args = {}) => {
      const clave = `h:${usuario.id_usuario}:${herramienta.declaracion.name}:${JSON.stringify(args)}`
      return cacheHerramientas.through(clave, () => ejecutarReal(args))
    },
  }
}

// Misma semántica que PermissionRoute del frontend y que copiloto.navegacion.
// js: Super Admin pasa siempre, y un array significa "cualquiera de estos".
function cumplePermiso(usuario, permiso) {
  if (!permiso) return true
  if (usuario?.esSuperAdmin) return true
  const codigos = Array.isArray(permiso) ? permiso : [permiso]
  return codigos.some((c) => usuario?.permisos?.has(c))
}

// Deja rastro de las herramientas marcadas con `auditar`. Se envuelve DESPUÉS
// de la caché (ver el orden en construirHerramientas) para que un acierto de
// caché también quede registrado: lo que auditamos es que el usuario pidió la
// acción, no que se ejecutara la consulta por dentro.
//
// El registro es fire-and-forget igual que en el resto del proyecto (ver
// utils/auditoria.js): si Mongo falla, se pierde la fila de auditoría, no la
// respuesta al usuario.
function conAuditoria(herramienta, usuario, contexto) {
  if (!herramienta.auditar) return herramienta
  const ejecutarReal = herramienta.ejecutar
  const nombre = herramienta.declaracion.name
  return {
    ...herramienta,
    ejecutar: async (args = {}) => {
      let resultado
      let fallo = null
      try {
        resultado = await ejecutarReal(args)
        return resultado
      } catch (err) {
        fallo = err
        throw err
      } finally {
        registrarAuditoria({
          usuario,
          accion: 'copiloto_herramienta',
          modulo: herramienta.modulo || 'copiloto',
          entidad: nombre,
          descripcion: `Skynet ejecutó "${nombre}"`,
          // Solo los argumentos, nunca el resultado: el resultado son datos de
          // negocio que ya viven en su propia colección, y copiarlos aquí
          // duplicaría información sensible en un registro que se consulta con
          // otro permiso.
          cambios: { despues: recortarArgs(args) },
          ip: contexto?.ip,
          resultado: fallo ? 'error' : 'exito',
        })
      }
    },
  }
}

// Los argumentos van al registro de auditoría, así que se acotan: vienen de un
// modelo y podrían ser arbitrariamente grandes.
function recortarArgs(args) {
  try {
    const texto = JSON.stringify(args)
    return texto.length > 1000 ? { truncado: `${texto.slice(0, 1000)}…` } : args
  } catch {
    return { noSerializable: true }
  }
}

/**
 * Devuelve SOLO las herramientas que este usuario puede usar según su rol,
 * sus permisos y qué módulos estén activos. Lo que no pasa el filtro nunca se
 * le declara al modelo, así que no puede invocarlo aunque el usuario se lo
 * pida de forma insistente o creativa.
 *
 * @param {object} usuario   req.usuario
 * @param {{ip?: string}} contexto  Datos de la petición para la auditoría.
 */
export async function construirHerramientas(usuario, contexto = {}) {
  // El catálogo de navegación se resuelve ANTES de construir las herramientas
  // porque la descripción de `abrir_seccion` tiene que enumerar los destinos
  // de este usuario: es lo que hace que el modelo no pueda ofrecer una sección
  // que no le corresponde (no la ve declarada en ningún momento).
  const destinos = await destinosDisponibles(usuario)
  const catalogoTexto = destinos.map((d) => `- ${d.clave}: ${d.titulo} (${d.alias.join(', ')})`).join('\n')

  const candidatas = catalogoHerramientas(usuario, { ...contexto, catalogoTexto }).filter(
    (h) => cumplePermiso(usuario, h.permiso) && (!h.disponible || h.disponible(usuario))
  )
  const activas = await Promise.all(
    candidatas.map(async (h) => ((h.modulo ? await estaModuloActivo(h.modulo) : true) ? h : null))
  )
  return activas
    .filter(Boolean)
    .map((h) => conAuditoria(conCache(h, usuario), usuario, contexto))
}
