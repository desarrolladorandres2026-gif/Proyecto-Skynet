import { useState } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Bold, Italic, Underline as IconoSubrayado, Heading2, Heading3, List, ListOrdered, Quote, Link2, ImagePlus, Undo2, Redo2 } from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { PromptDialog } from '../../components/PromptDialog.jsx'
import { SelectorImagen } from './SelectorImagen.jsx'

// HTML que este editor puede producir. El backend vuelve a sanitizar todo
// (ver Backend/src/modules/sitio_web/html.js): esta lista sirve para decidir si
// el contenido de una noticia hecha en WordPress se puede editar aquí sin
// perder formato. Si trae otra cosa (divs, figuras, estilos…), se edita en WP.
const ETIQUETAS_EDITABLES = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr'])

export function esContenidoEditable(html) {
  const etiquetas = html.match(/<\/?[a-z][a-z0-9]*/gi) || []
  return etiquetas.every((e) => ETIQUETAS_EDITABLES.has(e.replace(/^<\/?/, '').toLowerCase()))
}

function Boton({ activo, onClick, etiqueta, deshabilitado, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={activo}
      className={cn(
        'rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-200/70 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800',
        activo && 'bg-brand-600/15 text-brand-700 dark:text-brand-300'
      )}
    >
      {children}
    </button>
  )
}

// Editor enriquecido (TipTap). Entrega HTML por `onChange`.
export function EditorTexto({ valorInicial = '', onChange, deshabilitado = false, alto = 'min-h-48' }) {
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [enlaceAbierto, setEnlaceAbierto] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false } }), Image],
    content: valorInicial,
    editable: !deshabilitado,
    onUpdate: ({ editor: e }) => onChange?.(e.isEmpty ? '' : e.getHTML()),
    editorProps: {
      attributes: {
        class: cn('prose-sm max-w-none px-3 py-2.5 text-sm text-slate-900 focus:outline-none dark:text-slate-100', alto, '[&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-brand-600 [&_a]:underline [&_img]:my-2 [&_img]:max-h-72 [&_img]:rounded-lg [&_p]:my-1.5'),
      },
    },
  })

  const activo = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        negrita: e.isActive('bold'),
        cursiva: e.isActive('italic'),
        subrayado: e.isActive('underline'),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        lista: e.isActive('bulletList'),
        numerada: e.isActive('orderedList'),
        cita: e.isActive('blockquote'),
        enlace: e.isActive('link'),
        puedeDeshacer: e.can().undo(),
        puedeRehacer: e.can().redo(),
      },
  })

  if (!editor || !activo) return null
  const cadena = () => editor.chain().focus()

  return (
    <div className="panel-input overflow-hidden rounded-lg">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/70 px-1.5 py-1 dark:border-slate-800 dark:bg-slate-900/60">
        <Boton etiqueta="Negrita" activo={activo.negrita} deshabilitado={deshabilitado} onClick={() => cadena().toggleBold().run()}><Bold className="h-4 w-4" /></Boton>
        <Boton etiqueta="Cursiva" activo={activo.cursiva} deshabilitado={deshabilitado} onClick={() => cadena().toggleItalic().run()}><Italic className="h-4 w-4" /></Boton>
        <Boton etiqueta="Subrayado" activo={activo.subrayado} deshabilitado={deshabilitado} onClick={() => cadena().toggleUnderline().run()}><IconoSubrayado className="h-4 w-4" /></Boton>
        <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        <Boton etiqueta="Título" activo={activo.h2} deshabilitado={deshabilitado} onClick={() => cadena().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Boton>
        <Boton etiqueta="Subtítulo" activo={activo.h3} deshabilitado={deshabilitado} onClick={() => cadena().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Boton>
        <Boton etiqueta="Lista con viñetas" activo={activo.lista} deshabilitado={deshabilitado} onClick={() => cadena().toggleBulletList().run()}><List className="h-4 w-4" /></Boton>
        <Boton etiqueta="Lista numerada" activo={activo.numerada} deshabilitado={deshabilitado} onClick={() => cadena().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Boton>
        <Boton etiqueta="Cita" activo={activo.cita} deshabilitado={deshabilitado} onClick={() => cadena().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Boton>
        <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        <Boton
          etiqueta={activo.enlace ? 'Quitar enlace' : 'Insertar enlace'}
          activo={activo.enlace}
          deshabilitado={deshabilitado}
          onClick={() => (activo.enlace ? cadena().unsetLink().run() : setEnlaceAbierto(true))}
        >
          <Link2 className="h-4 w-4" />
        </Boton>
        <Boton etiqueta="Insertar imagen" deshabilitado={deshabilitado} onClick={() => setSelectorAbierto(true)}><ImagePlus className="h-4 w-4" /></Boton>
        <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        <Boton etiqueta="Deshacer" deshabilitado={deshabilitado || !activo.puedeDeshacer} onClick={() => cadena().undo().run()}><Undo2 className="h-4 w-4" /></Boton>
        <Boton etiqueta="Rehacer" deshabilitado={deshabilitado || !activo.puedeRehacer} onClick={() => cadena().redo().run()}><Redo2 className="h-4 w-4" /></Boton>
      </div>

      <EditorContent editor={editor} />

      {selectorAbierto && (
        <SelectorImagen
          abierto
          onCerrar={() => setSelectorAbierto(false)}
          onElegir={(m) => {
            setSelectorAbierto(false)
            cadena().setImage({ src: m.url, alt: m.alt || m.titulo || '' }).run()
          }}
        />
      )}

      <PromptDialog
        abierto={enlaceAbierto}
        onCancelar={() => setEnlaceAbierto(false)}
        onConfirmar={({ url }) => {
          const destino = url.trim()
          if (/^(https?:\/\/|mailto:|tel:)/i.test(destino)) {
            cadena().extendMarkRange('link').setLink({ href: destino, target: '_blank' }).run()
            setEnlaceAbierto(false)
          }
        }}
        titulo="Insertar enlace"
        descripcion="Selecciona primero el texto que será el enlace. La dirección debe empezar por https://, mailto: o tel:."
        campos={[{ nombre: 'url', label: 'Dirección', requerido: true, placeholder: 'https://…' }]}
        confirmarLabel="Insertar"
      />
    </div>
  )
}
