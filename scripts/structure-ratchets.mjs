export const STRUCTURE_RATCHETS = [
  {
    group: 'app-large-surfaces',
    maxLines: 1150,
    files: ['src/lib/demo.ts'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 430,
    files: ['src/App.tsx'],
  },
  {
    group: 'app-shell-components',
    maxLines: 130,
    files: ['src/hooks/useShellState.ts'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 575,
    files: ['src/components/TwitterView.tsx'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 135,
    files: ['src/components/CommandPalette.tsx'],
  },
  {
    group: 'command-palette-search',
    maxLines: 120,
    files: ['src/hooks/useCommandSearch.ts'],
  },
  {
    group: 'command-palette-search',
    maxLines: 520,
    files: ['src/hooks/commandSearchModel.ts'],
  },
  {
    group: 'command-palette-search',
    maxLines: 65,
    files: ['src/hooks/useCommandServerSearch.ts'],
  },
  {
    group: 'app-shell-components',
    maxLines: 90,
    files: [
      'src/components/appShell/ShellTopChrome.tsx',
      'src/components/appShell/ShellAttentionLayer.tsx',
      'src/components/appShell/appShellModel.ts',
    ],
  },
  {
    group: 'command-palette-components',
    maxLines: 80,
    files: [
      'src/components/commandPalette/CommandPaletteSearchMode.tsx',
      'src/components/commandPalette/commandPaletteModel.ts',
      'src/components/commandPalette/commandPaletteSelectionModel.ts',
    ],
  },
  {
    group: 'command-palette-components',
    maxLines: 220,
    files: ['src/components/commandPalette/useCommandPaletteController.ts'],
  },
  {
    group: 'command-palette-components',
    maxLines: 150,
    files: ['src/components/commandPalette/CommandPaletteDialog.tsx'],
  },
  {
    group: 'app-large-surfaces',
    maxLines: 505,
    files: ['src/components/GraphView.tsx'],
  },
  {
    group: 'notas-feed-surfaces',
    maxLines: 430,
    files: ['src/components/notas/NotasFeedView.tsx'],
  },
  {
    group: 'notas-feed-components',
    maxLines: 280,
    files: ['src/components/notas/useNotasComposer.ts'],
  },
  {
    group: 'notas-feed-components',
    maxLines: 130,
    files: [
      'src/components/notas/NotasFeedContent.tsx',
      'src/components/notas/useNotasFeedSelection.ts',
      'src/components/notas/useNotasFeedVirtualWindow.ts',
    ],
  },
  {
    group: 'notas-feed-components',
    maxLines: 160,
    files: ['src/components/notas/NotasFeedControls.tsx'],
  },
  {
    group: 'notas-feed-components',
    maxLines: 220,
    files: ['src/components/notas/NotasFeedComposer.tsx'],
  },
  {
    group: 'notas-feed-components',
    maxLines: 225,
    files: [
      'src/components/notas/NotasFeedVirtualList.tsx',
      'src/components/notas/notasFeedViewModel.ts',
    ],
  },
  {
    group: 'recortes-surfaces',
    maxLines: 285,
    files: ['src/components/recortes/RecorteCard.tsx'],
  },
  {
    group: 'recortes-components',
    maxLines: 115,
    files: [
      'src/components/recortes/RecorteMediaPreview.tsx',
      'src/components/recortes/recorteCardModel.ts',
    ],
  },
  {
    group: 'recortes-components',
    maxLines: 175,
    files: [
      'src/components/recortes/RecorteCardBody.tsx',
      'src/components/recortes/RecorteCardMenu.tsx',
    ],
  },
  {
    group: 'momentos-surfaces',
    maxLines: 300,
    files: ['src/components/MomentosView.tsx'],
  },
  {
    group: 'settings-surfaces',
    maxLines: 125,
    files: ['src/components/Settings.tsx'],
  },
  {
    group: 'settings-components',
    maxLines: 75,
    files: [
      'src/components/settings/SettingsNav.tsx',
      'src/components/settings/SettingsPanelContent.tsx',
      'src/components/settings/settingsModel.ts',
    ],
  },
  {
    group: 'settings-surfaces',
    maxLines: 80,
    files: ['src/components/settings/LogsPanel.tsx'],
  },
  {
    group: 'settings-surfaces',
    maxLines: 200,
    files: ['src/components/settings/DataPanel.tsx'],
  },
  {
    group: 'settings-components',
    maxLines: 150,
    files: ['src/components/settings/dataImportPreviewModel.ts'],
  },
  {
    group: 'settings-components',
    maxLines: 115,
    files: ['src/components/settings/useDataPanelImportPreview.ts'],
  },
  {
    group: 'settings-surfaces',
    maxLines: 120,
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
      'netlify/functions/pdf-stamp-assets.mts',
    ],
  },
  {
    group: 'server-import-payload',
    maxLines: 360,
    files: ['netlify/functions/_lib/import-payload.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 540,
    files: ['netlify/functions/_lib/recortes-endpoint.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 550,
    files: ['netlify/functions/_lib/momentos-endpoint.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 480,
    files: ['netlify/functions/_lib/entities-endpoint.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 190,
    files: ['netlify/functions/_lib/search-endpoint.ts'],
  },
  {
    group: 'server-api-endpoints',
    maxLines: 220,
    files: ['netlify/functions/_lib/pdf-stamp-assets-endpoint.ts'],
  },
  {
    group: 'server-api-wrappers',
    maxLines: 90,
    files: ['netlify/functions/whatsapp-webhook.mts'],
  },
  {
    group: 'server-whatsapp-boundary',
    maxLines: 400,
    files: ['netlify/functions/_lib/whatsapp/webhook-endpoint.ts'],
  },
  {
    group: 'server-large-surfaces',
    maxLines: 400,
    files: ['netlify/functions/_lib/llm/dispatch.ts'],
  },
  {
    group: 'server-llm-boundaries',
    maxLines: 110,
    files: [
      'netlify/functions/_lib/llm/provider-chain.ts',
      'netlify/functions/_lib/llm/cache-policy.ts',
    ],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 582,
    files: ['src/components/notas/pdfStudio/editor/PdfTextEditor.tsx'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 365,
    files: ['src/components/notas/pdfStudio/PdfStudioView.tsx'],
  },
  {
    group: 'pdf-studio-shell-components',
    maxLines: 90,
    files: [
      'src/components/notas/pdfStudio/PdfStudioViewCanvas.tsx',
      'src/components/notas/pdfStudio/PdfStudioWorkspacePanel.tsx',
    ],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 225,
    files: ['src/lib/pdfStudio/assemble/assemble.ts'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 165,
    files: ['src/components/notas/pdfStudio/editor/EditorToolbar.tsx'],
  },
  {
    group: 'pdf-studio-core',
    maxLines: 270,
    files: ['src/components/notas/pdfStudio/editor/EditorToolbarGroups.tsx'],
  },
  {
    group: 'pdf-studio-core-models',
    maxLines: 90,
    files: [
      'src/components/notas/pdfStudio/PdfStudioViewModel.ts',
      'src/components/notas/pdfStudio/PdfStudioTextEditorOverlay.tsx',
      'src/components/notas/pdfStudio/editor/EditorToolbarModel.ts',
      'src/components/notas/pdfStudio/editor/PdfTextEditorLazy.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorPageSurfaceModel.ts',
    ],
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
    maxLines: 270,
    files: [
      'src/lib/pdfStudio/model/modelForms.ts',
      'src/components/notas/pdfStudio/planillas/FormFieldLayer.tsx',
      'src/components/notas/pdfStudio/planillas/usePdfTextEditorForms.ts',
      'src/components/notas/pdfStudio/planillas/SignatureCaptureDialog.tsx',
      'src/components/notas/pdfStudio/planillas/FormFieldInspector.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorFormSurface.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorPageSurface.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorPageFormLayer.tsx',
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
    maxLines: 200,
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
