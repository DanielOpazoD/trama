export const STRUCTURE_RATCHETS = [
  {
    group: 'app-large-surfaces',
    maxLines: 1150,
    files: ['src/lib/demo.ts'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 650,
    files: ['src/App.tsx'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 575,
    files: ['src/components/TwitterView.tsx'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 420,
    files: ['src/components/CommandPalette.tsx'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 505,
    files: ['src/components/GraphView.tsx'],
  },
  {
    group: 'notas-feed-surfaces',
    maxLines: 760,
    files: ['src/components/notas/NotasFeedView.tsx'],
  },
  {
    group: 'notas-feed-components',
    maxLines: 130,
    files: ['src/components/notas/NotasFeedContent.tsx'],
  },
  {
    group: 'notas-feed-components',
    maxLines: 350,
    files: ['src/components/notas/NotasFeedControls.tsx'],
  },
  {
    group: 'notas-feed-components',
    maxLines: 220,
    files: ['src/components/notas/NotasFeedComposer.tsx'],
  },
  {
    group: 'recortes-surfaces',
    maxLines: 440,
    files: ['src/components/recortes/RecorteCard.tsx'],
  },
  {
    group: 'recortes-components',
    maxLines: 115,
    files: ['src/components/recortes/RecorteMediaPreview.tsx'],
  },
  {
    group: 'momentos-surfaces',
    maxLines: 420,
    files: ['src/components/MomentosView.tsx'],
  },
  {
    group: 'settings-surfaces',
    maxLines: 455,
    files: ['src/components/settings/LogsPanel.tsx'],
  },
  {
    group: 'settings-surfaces',
    maxLines: 435,
    files: ['src/components/settings/DataPanel.tsx'],
  },
  {
    group: 'settings-surfaces',
    maxLines: 375,
    files: ['src/components/settings/HealthPanel.tsx'],
  },
  {
    group: 'server-large-surfaces',
    maxLines: 430,
    files: ['netlify/functions/import.mts'],
  },
  {
    group: 'server-api-wrappers',
    maxLines: 90,
    files: [
      'netlify/functions/recortes.mts',
      'netlify/functions/momentos.mts',
      'netlify/functions/entities.mts',
      'netlify/functions/search.mts',
    ],
  },
  {
    group: 'server-import-payload',
    maxLines: 360,
    files: ['netlify/functions/_lib/import-payload.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 650,
    files: ['netlify/functions/_lib/recortes-endpoint.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 560,
    files: ['netlify/functions/_lib/momentos-endpoint.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 480,
    files: ['netlify/functions/_lib/entities-endpoint.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 460,
    files: ['netlify/functions/_lib/search-endpoint.ts'],
  },
  {
    group: 'server-large-surfaces',
    maxLines: 465,
    files: ['netlify/functions/_lib/llm/dispatch.ts'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 582,
    files: ['src/components/notas/pdfStudio/editor/PdfTextEditor.tsx'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 390,
    files: ['src/components/notas/pdfStudio/PdfStudioView.tsx'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 225,
    files: ['src/lib/pdfStudio/assemble/assemble.ts'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 290,
    files: ['src/components/notas/pdfStudio/editor/EditorToolbar.tsx'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 270,
    files: ['src/components/notas/pdfStudio/editor/AnnotationLayer.tsx'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 110,
    files: ['src/lib/pdfStudio/model/model.ts'],
  },
  {
    group: 'pdf-studio-model-boundaries',
    maxLines: 220,
    files: ['src/lib/pdfStudio/model/modelDocument.ts'],
  },
  {
    group: 'pdf-studio-model-boundaries',
    maxLines: 170,
    files: ['src/lib/pdfStudio/model/modelPages.ts'],
  },
  {
    group: 'pdf-studio-model-boundaries',
    maxLines: 140,
    files: ['src/lib/pdfStudio/model/modelAnnotations.ts'],
  },
  {
    group: 'pdf-studio-model-boundaries',
    maxLines: 90,
    files: ['src/lib/pdfStudio/model/pageCommands.ts'],
  },
  {
    group: 'pdf-studio-forms',
    maxLines: 300,
    files: [
      'src/lib/pdfStudio/model/modelForms.ts',
      'src/components/notas/pdfStudio/planillas/FormFieldLayer.tsx',
      'src/components/notas/pdfStudio/planillas/usePdfTextEditorForms.ts',
      'src/components/notas/pdfStudio/planillas/SignatureCaptureDialog.tsx',
      'src/components/notas/pdfStudio/planillas/FormFieldInspector.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorFormSurface.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorPageSurface.tsx',
      'src/components/notas/pdfStudio/planillas/pdfFormVisualMapping.ts',
      'src/components/notas/pdfStudio/editor/pdfEditorZoomScroll.ts',
      'src/components/notas/pdfStudio/editor/usePdfEditorZoomScroll.ts',
      'src/components/notas/pdfStudio/editor/EditorToolbarFormMenu.tsx',
    ],
  },
  {
    group: 'pdf-studio-template-mode',
    maxLines: 140,
    files: [
      'src/components/notas/pdfStudio/planillas/design/PdfTemplateModeBanner.tsx',
      'src/components/notas/pdfStudio/planillas/design/usePdfStudioTemplateMode.tsx',
      'src/components/notas/pdfStudio/shell/PdfStudioWorkspacePanelHost.tsx',
    ],
  },
  {
    group: 'pdf-studio-workspace',
    maxLines: 160,
    files: ['src/components/notas/pdfStudio/workspace/WorkspacePanel.tsx'],
  },
  {
    group: 'pdf-studio-workspace',
    maxLines: 190,
    files: ['src/components/notas/pdfStudio/workspace/WorkspaceTemplatesSection.tsx'],
  },
  {
    group: 'pdf-studio-workspace',
    maxLines: 250,
    files: ['src/components/notas/pdfStudio/workspace/WorkspaceTemplateCard.tsx'],
  },
  {
    group: 'pdf-studio-workspace',
    maxLines: 180,
    files: ['src/components/notas/pdfStudio/workspace/WorkspaceSavedDocsSection.tsx'],
  },
  {
    group: 'pdf-studio-ocr',
    maxLines: 120,
    files: [
      'src/lib/pdfStudio/ocr/pdfOcr.ts',
      'src/lib/pdfStudio/ocr/pdfOcrInput.ts',
      'src/lib/pdfStudio/ocr/pdfOcrLimits.ts',
      'src/lib/pdfStudio/ocr/pdfOcrRecognition.ts',
      'src/lib/pdfStudio/ocr/pdfOcrSearchablePdf.ts',
      'src/lib/pdfStudio/ocr/pdfOcrWorkerClient.ts',
      'src/lib/pdfStudio/ocr/pdfOcrBackendAdapter.ts',
    ],
  },
]
