/**
 * Cache-Control para la media privada que servimos nosotros (Netlify Blobs).
 *
 * **Por qué `immutable` es seguro acá.** Toda storageKey de media nace en el
 * servidor con `crypto.getRandomValues` y NUNCA se reescribe: subir de nuevo
 * crea una key nueva, y borrar es soft-delete (la key muere, no cambia de
 * contenido). Bajo esa invariante, cachear para siempre no puede servir
 * contenido desactualizado — no existe "versión nueva" de una key.
 *
 * **Por qué `private`.** Es contenido de un usuario detrás de auth: puede
 * vivir en la caché del NAVEGADOR (que es lo que elimina las re-descargas al
 * navegar), nunca en una caché compartida/CDN. Los endpoints además mandan
 * `Vary: Authorization`.
 *
 * **Dónde NO usar esto.** Los 302 a URLs presignadas de R2 (videos, archivos
 * grandes): la URL firmada vence en ~15 min, así que cachear el redirect
 * serviría enlaces muertos. Esos responden `private, no-store` a propósito.
 *
 * Antes todo iba `private, no-store`: cada visita al álbum re-bajaba cada
 * foto entera aunque no hubiera cambiado — el costo de red más grande de la
 * app, pagado en cada navegación.
 */
export const IMMUTABLE_PRIVATE_MEDIA_CACHE = 'private, max-age=31536000, immutable'
