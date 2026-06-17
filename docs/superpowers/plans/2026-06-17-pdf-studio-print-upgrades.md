# PDF Studio Print Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Imprenta consume image recortes and export printable image documents with margins, image grids, text boxes with italic styling, and document headers/footers.

**Architecture:** Keep the changes inside the existing PDF Studio boundaries: pure model/types, export assembly, editor controls, and Notas/Recortes UI wiring. Recortes passes selected image keys upward to NotasWorld, which downloads them and lazy-loads PDF Studio only when switching to Imprenta.

**Tech Stack:** React, TypeScript, Vitest, pdf-lib, existing Netlify authenticated media endpoints.

---

### Task 1: Document Settings And Image Layout Model

**Files:**

- Modify: `src/lib/pdfStudio/model/modelTypes.ts`
- Modify: `src/lib/pdfStudio/model/modelDocument.ts`
- Test: `src/lib/pdfStudio/model/model.test.ts`

- [ ] Add `DocSettings.header`, `DocSettings.footer`, and `DocSettings.imageLayout.imagesPerPage`.
- [ ] Normalize legacy docs to default `imagesPerPage: 1` only at read/use boundaries, without forcing old persisted drafts to change shape.
- [ ] Verify `setDocSettings` preserves unrelated existing settings.

### Task 2: Export Images As Printable Pages

**Files:**

- Modify: `src/lib/pdfStudio/assemble/assembleImages.ts`
- Modify: `src/lib/pdfStudio/assemble/assemble.ts`
- Test: `src/lib/pdfStudio/assemble/assemble.test.ts`

- [ ] Write failing tests that image pages export on an A4-like sheet with white margins instead of image-sized pages.
- [ ] Write failing tests for `imagesPerPage` values `1, 2, 3, 4, 6`.
- [ ] Implement grouped image sheet assembly only for image pages. PDF source pages keep copyPages behavior.
- [ ] Preserve compression policy and PNG/JPEG behavior inside each image cell.

### Task 3: Header, Footer, And Italic Text Export

**Files:**

- Modify: `src/lib/pdfStudio/model/modelTypes.ts`
- Modify: `src/lib/pdfStudio/model/modelText.ts`
- Modify: `src/lib/pdfStudio/assemble/assembleAnnotations.ts`
- Modify: `src/lib/pdfStudio/assemble/assembleDocumentSettings.ts`
- Test: `src/lib/pdfStudio/assemble/assemble.test.ts`
- Test: `src/components/notas/pdfStudio/editor/pdfEditorStyleState.test.ts`

- [ ] Add `italic?: boolean` to text annotations and editor text style.
- [ ] Export italic text using the closest standard/embedded font path available.
- [ ] Draw configured header/footer on every exported page.
- [ ] Keep page numbers and watermark behavior unchanged.

### Task 4: Editor And Toolbar Controls

**Files:**

- Modify: `src/components/notas/pdfStudio/editor/editorStyle.ts`
- Modify: `src/components/notas/pdfStudio/editor/pdfEditorStyleState.ts`
- Modify: `src/components/notas/pdfStudio/editor/EditorToolbarStyleMenu.tsx`
- Modify: `src/components/notas/pdfStudio/editor/AnnotationTextBox.tsx`
- Modify: `src/components/notas/pdfStudio/shell/PdfStudioDocumentToolbar.tsx`
- Test: `src/components/notas/pdfStudio/editor/EditorToolbar.test.tsx`
- Test: `src/components/notas/pdfStudio/PdfStudioView.test.tsx`

- [ ] Add an Italic toggle beside Bold in the text menu.
- [ ] Preview selected/new text with italic CSS.
- [ ] Add document settings inputs for header, footer, and images per page.
- [ ] Verify the existing movable text box behavior remains unchanged.

### Task 5: Recortes To Imprenta Bridge

**Files:**

- Modify: `src/components/notas/NotasWorld.tsx`
- Modify: `src/components/notas/NotasFeedView.tsx`
- Modify: `src/components/recortes/RecorteSelectionBar.tsx`
- Modify: `src/components/notas/pdfStudio/PdfStudioView.tsx`
- Test: `src/components/recortes/RecorteSelectionBar.test.tsx`
- Test: `src/components/notas/NotasWorld.test.tsx`
- Test: `src/components/notas/pdfStudio/PdfStudioView.test.tsx`

- [ ] Expose a callback from Recortes selection bar for selected image recortes.
- [ ] Download authenticated images with existing `recorteImageUrl` and `apiFetch`.
- [ ] Switch NotasWorld to section `pdf` and pass imported files into PdfStudioView.
- [ ] PdfStudioView consumes pending files once and imports them through `usePdfStudioImport`.

### Task 6: Verification

**Commands:**

- `npm test -- src/lib/pdfStudio/assemble/assemble.test.ts src/lib/pdfStudio/assemble/assembleImages.test.ts src/components/notas/pdfStudio/editor/pdfEditorStyleState.test.ts src/components/notas/pdfStudio/editor/EditorToolbar.test.tsx src/components/notas/pdfStudio/PdfStudioView.test.tsx src/components/recortes/RecorteSelectionBar.test.tsx src/components/notas/NotasWorld.test.tsx`
- `npm run typecheck`
- `npm run build`

- [ ] Run focused tests.
- [ ] Run typecheck.
- [ ] Run build.
- [ ] Inspect `git diff` for scope and no accidental migration edits.
