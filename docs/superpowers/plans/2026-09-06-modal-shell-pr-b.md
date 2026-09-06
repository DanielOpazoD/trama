# ModalShell, PR B: adopción y trinquete

## Problema

El issue #306 pedía un modal primitivo compartido. El PR A (#303) dejó
`ModalShell` con portal, backdrop, foco atrapado, `Escape` y bloqueo de scroll,
y lo adoptaron seis diálogos. Después nadie más lo usó: cada modal nuevo
volvía a montar su propio backdrop con `useModalOverlay`, y nada avisaba. El
issue quedó abierto sin criterio de cierre.

## Cambios

- **`ModalShell` crece solo lo que pidieron los casos reales**: tamaños `xs`
  (QR) y `lg` (hoja de atajos), `backdropLabel` (el backdrop de una
  confirmación se llama «Cancelar», no «Cerrar»), `role="alertdialog"` y
  `closeOnEscape` (una eliminación en vuelo no se cancela a medias).
- **Cuatro diálogos migrados**: `MomentoQRModal`, `ShortcutsModal`,
  `WorkspaceTemplateVersionsDialog` y `ConfirmDestroy`. Cada uno pierde su
  backdrop, su `useModalOverlay` y su caja centrada; conserva su contenido y
  sus tests (20 en verde, sin tocar las aserciones de rol y botones).
- **`check:modal-overlay` aprende que montar `ModalShell` es adoptar**: el
  shell llama al hook por el componente. Sin eso, `role="alertdialog"` como
  prop del shell se leía como un dialog hecho a mano.
- **Trinquete `check:modal-shell`** (`scripts/check-modal-shell.mjs`, job
  `lint`): todo archivo que use `useModalOverlay` o `createPortal` está
  ADOPTADO (usa `ModalShell`), EXENTO (lightbox, hoja de móvil, overlays de
  pantalla completa, paletas: 24 con su motivo) o PENDIENTE (4 que sí deberían
  migrar). Un archivo nuevo sin clasificar falla el gate; una exención o un
  pendiente que ya no existe o que ya migró también falla (trinquete, no
  lista muerta).

## Decisiones

- **La lista de exentos lleva motivo por línea.** Un lightbox a pantalla
  completa o la hoja inferior de móvil no son cajas centradas; forzarlos a
  `ModalShell` sería peor. El gate exige decir por qué, no solo excluir.
- **Los cuatro PENDIENTES no entran en este PR** (`PromoteModal`, `LibroModal`,
  `LaminaModal`, `BibliotecaLinkPicker`): son diálogos con estado propio y
  merecen su pack; el trinquete impide que la lista crezca mientras tanto.
- **#306 se cierra con este PR.** El criterio de cierre que faltaba es el gate:
  el primitivo existe, diez diálogos lo usan y ningún modal nuevo puede
  esquivarlo sin declararlo.

## Validación

- `check:modal-shell` en verde sobre el repo (ADOPTADOS 10, EXENTOS 24,
  PENDIENTES 4) y su test unitario, que además comprueba el trinquete sobre el
  repo real.
- Tests de los cuatro diálogos y de `ModalShell` en verde; `typecheck`,
  `lint`, `format:check` y los gates del job `lint`.
- Suite completa de unidad en verde.

## Pendiente

- Resuelto (pack `2026-09-06-modal-shell-pr-c`): tres PENDIENTES migraron y
  `BibliotecaLinkPicker` quedó exento con motivo (se apila sobre un visor en
  `z-[100]`).
- `ModalShell` no expone `aria-labelledby`; `ConfirmDestroy` pasa el título
  como `aria-label`, que para un `alertdialog` de una línea es equivalente.
