## Summary

<!-- 1-3 bullets de qué hace este PR y por qué. -->

-
-

## Cambios principales

<!-- Lista de los cambios visibles para reviewers. Filepath:linea cuando aplique. -->

-

## Test plan

<!-- Cómo verifico que esto funciona. Pasos manuales o lista de comandos. -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] CI verde

## Notas para el reviewer

<!-- Decisiones de diseño, trade-offs, áreas que merecen mirada extra. -->

<!--
Checklist convenciones (CLAUDE.md):
- [ ] Migrations nuevas son ADITIVAS (no modifican migrations previas)
- [ ] Soft delete consistente (UPDATE SET deleted_at, no DELETE FROM)
- [ ] snake_case en SQL ↔ camelCase en TS con transforms en src/api/
- [ ] ApiErrors.* en lugar de new Response('texto', { status })
- [ ] Zod en bodies de POST/PUT/PATCH
- [ ] Tests para flujos nuevos
- [ ] Documentación actualizada si tocaste un domain pattern
-->
