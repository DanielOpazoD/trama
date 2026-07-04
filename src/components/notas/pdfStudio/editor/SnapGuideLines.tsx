import type { SnapGuide } from './pdfAnnotationSnap'

/** Líneas guía magnéticas (verticales/horizontales) sobre la página activa,
 *  compartidas entre anotaciones y casilleros. Posicionadas en % dentro del
 *  contenedor relativo de la página. */
export function SnapGuideLines({ guides }: { guides: SnapGuide[] }) {
  return (
    <>
      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.ratio}`}
          aria-hidden="true"
          data-pdf-snap-guide={guide.axis}
          className="animate-pdf-guide-in pointer-events-none absolute z-20 bg-[color:var(--accent-sage)]/70"
          style={
            guide.axis === 'x'
              ? {
                  left: `${guide.ratio * 100}%`,
                  top: 0,
                  width: 1,
                  height: '100%',
                  transform: 'translateX(-50%)',
                }
              : {
                  left: 0,
                  top: `${guide.ratio * 100}%`,
                  width: '100%',
                  height: 1,
                  transform: 'translateY(-50%)',
                }
          }
        />
      ))}
    </>
  )
}
