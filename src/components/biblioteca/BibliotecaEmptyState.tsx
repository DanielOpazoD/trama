import { SearchIcon } from '../Icons'

/**
 * Estado vacío de la Biblioteca: contenedor sobrio con borde punteado, un ícono
 * de lupa apagado, un título serif y una línea secundaria. Sin cohetes ni tono
 * cantarín — coherente con la voz editorial del producto.
 *
 * Se usa cuando la búsqueda/pestaña no devuelve archivos (y también cuando la
 * Biblioteca está genuinamente vacía; el cobre del subtítulo invita sin gritar).
 */
export function BibliotecaEmptyState() {
  return (
    <div
      className="mt-8 border border-dashed border-ink-200 rounded-xl px-8 py-12 max-w-xl mx-auto text-center animate-fade-up"
      data-testid="biblioteca-empty"
    >
      <div className="text-ink-200 flex justify-center mb-4">
        <SearchIcon size={22} />
      </div>
      <h3 className="font-serif text-2xl text-ink-600 italic leading-tight">
        No se encontraron archivos
      </h3>
      <p className="mt-3 text-sm text-ink-400 leading-relaxed">
        Prueba cambiando los filtros o subiendo un archivo.
      </p>
    </div>
  )
}
