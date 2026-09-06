# Fotos a Imprenta también desde el Álbum

## Problema

El puente Momentos → Imprenta (#436) se abrió solo desde la Línea: el menú de
cada entrada. El Álbum, que es la vista donde una persona mira sus fotos, no
tenía la acción; y era el pendiente declarado de ese pack.

## Cambios

- **`useSendMomentoToImprenta(momento)`**: el envío (descargar las fotos como
  archivos, encolarlas en `imprentaHandoff`, avisar solo si falla) sale de
  `MomentoEntry` y pasa a un hook que comparten la Línea y el Álbum.
- **`AlbumGrid`**: «Fotos a Imprenta» en «Opciones de foto», con el mismo
  nombre y el mismo icono que en la Línea. El menú aparece también cuando el
  momento es compartido en solo lectura: enviar a Imprenta no edita nada.

## Validación

- Unit: el clic en el Álbum deja los dos archivos en la cola del puente y
  cierra el menú (falla por mutación si se quita el ítem).
- E2E: la spec del puente cubre ahora los dos orígenes (Línea y Álbum) contra
  el backend simulado, hasta ver «Página 1» y «Página 2» en Imprenta.

## Pendiente

- Nada nuevo. El toast de «enviadas» sigue viviendo en NotasWorld (ver el
  plan de `2026-09-06-momentos-a-imprenta`).
