# Runbooks operacionales de Trama

Documentación pensada para Daniel — usuario único, no programador — cuando algo se rompe o cuando hay que hacer un cambio que él recuerda haber hecho hace seis meses y ya no se acuerda cómo.

**No es documentación de cómo funciona el sistema** (eso está en `CLAUDE.md`). Es "qué hacer cuando X pasa".

## Mapa de runbooks

- [**deploy.md**](deploy.md) — qué pasa al hacer `git push`, cómo monitorear, cómo hacer rollback si algo se rompe.
- [**migraciones.md**](migraciones.md) — cómo funciona el sistema de migraciones, cómo añadir una manualmente, cómo recuperarse si una falla en producción.
- [**datos.md**](datos.md) — export/import, ritual de backup, restaurar desde un JSON.
- [**ai.md**](ai.md) — providers, cost cap, modo Off, qué hacer si la IA se vuelve cara o lenta.
- [**incidentes.md**](incidentes.md) — síntomas comunes (la app no carga, el chat no responde, los embeddings no se generan) y qué hacer.
- [**escala.md**](escala.md) — cuándo y cómo activar los modos de escala (paginación de quotes, modo explorar del grafo, etc.).

## Cuándo abrir cada uno

| Síntoma | Runbook |
|---|---|
| Hice `git push` y quiero ver si subió | [deploy.md](deploy.md) |
| Cambié algo en el schema y el deploy falló | [migraciones.md](migraciones.md) |
| Necesito hacer una copia de seguridad ya | [datos.md](datos.md) |
| La IA está respondiendo raro o lento | [ai.md](ai.md) |
| Quiero saber cuánto he gastado en IA este mes | [ai.md](ai.md) |
| La app no abre / muestra error genérico | [incidentes.md](incidentes.md) |
| Tengo 5000+ entidades y va lento | [escala.md](escala.md) |

## Convención de los runbooks

Cada documento tiene esta estructura:

```
# <nombre>

## Cuándo abrir esto
(síntomas o decisiones que te traen aquí)

## Verificación rápida
(comandos o links para chequear el estado actual)

## Pasos
(qué hacer, en orden, con comandos exactos)

## Si algo sale mal
(cómo deshacer, cómo recuperar)

## Contexto técnico
(opcional, para entender por qué hace falta lo anterior)
```

Nada de prosa explicativa. Lista numerada, comandos exactos, links a la consola correspondiente.
