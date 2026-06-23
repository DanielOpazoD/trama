import { SearchIcon, TrashIcon } from '../Icons'

/**
 * Estado vacío de la Biblioteca: contenedor sobrio con borde punteado, un ícono
 * apagado, un título serif y una línea secundaria. Sin cohetes ni tono cantarín
 * — coherente con la voz editorial del producto.
 *
 * Se usa cuando la búsqueda/pestaña no devuelve archivos (y también cuando la
 * Biblioteca está genuinamente vacía). En la papelera (`trash`) cambia la copia
 * y el ícono: una papelera vacía no es un "no se encontró", es "no hay nada".
 */
export function BibliotecaEmptyState({ trash = false }: { trash?: boolean }) {
  return (
    <div
      className="mt-8 border border-dashed border-ink-200 rounded-xl px-8 py-12 max-w-xl mx-auto text-center animate-fade-up"
      data-testid="biblioteca-empty"
    >
      <div className="text-ink-200 flex justify-center mb-4">
        {trash ? <TrashIcon size={22} /> : <SearchIcon size={22} />}
      </div>
      <h3 className="font-serif text-2xl text-ink-600 italic leading-tight">
        {trash ? 'La papelera está vacía' : 'No se encontraron archivos'}
      </h3>
      <p className="mt-3 text-body text-ink-400 leading-relaxed">
        {trash
          ? 'Los archivos que elimines de la Biblioteca aparecerán acá.'
          : 'Prueba con otra búsqueda o cambiando los filtros.'}
      </p>
    </div>
  )
}
