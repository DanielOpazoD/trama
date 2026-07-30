import type { Row, Store } from './demoTypes'
import { dateAgo, daysAgo, parseTags, weekStartAgo } from './demoUtils'

function uid(): string {
  return crypto.randomUUID()
}

export function buildSeed(): Store {
  const ts = (d: number) => ({ created_at: daysAgo(d), updated_at: daysAgo(d) })
  type DemoOrigin = { kind: string; provider?: string }
  const manual: DemoOrigin = { kind: 'manual' }
  const ai: DemoOrigin = { kind: 'ai', provider: 'deepseek' }

  const eBorges = {
    id: 'e-borges',
    type: 'escritor',
    name: 'Jorge Luis Borges',
    year: 1899,
    description: 'El bibliotecario ciego del infinito.',
    essay: null,
    position_x: -120,
    position_y: -40,
    spotify_url: null,
    origin: manual,
    ...ts(20),
  }
  const eCortazar = {
    id: 'e-cortazar',
    type: 'escritor',
    name: 'Julio Cortázar',
    year: 1914,
    description: 'Cronopio mayor; la rayuela como método.',
    essay: null,
    position_x: 90,
    position_y: -70,
    spotify_url: null,
    origin: manual,
    ...ts(16),
  }
  const eFicciones = {
    id: 'e-ficciones',
    type: 'libro',
    name: 'Ficciones',
    year: 1944,
    description: null,
    essay: null,
    position_x: -180,
    position_y: 60,
    spotify_url: null,
    origin: manual,
    ...ts(14),
  }
  const eRayuela = {
    id: 'e-rayuela',
    type: 'libro',
    name: 'Rayuela',
    year: 1963,
    description: null,
    essay: null,
    position_x: 160,
    position_y: 40,
    spotify_url: null,
    origin: ai,
    ...ts(12),
  }
  const eLaberinto = {
    id: 'e-laberinto',
    type: 'concepto',
    name: 'El laberinto',
    year: null,
    description: 'Lo que se recorre sin centro.',
    essay: null,
    position_x: 0,
    position_y: 120,
    spotify_url: null,
    origin: manual,
    ...ts(9),
  }
  const eRadiohead = {
    id: 'e-radiohead',
    type: 'banda',
    name: 'Radiohead',
    year: 1985,
    description: null,
    essay: null,
    position_x: 40,
    position_y: -150,
    spotify_url: null,
    origin: manual,
    ...ts(6),
  }

  const entities: Row[] = [
    eBorges,
    eCortazar,
    eFicciones,
    eRayuela,
    eLaberinto,
    eRadiohead,
  ]

  const rel = (
    from: string,
    to: string,
    type: string,
    d: number,
    origin = manual,
  ): Row => ({
    id: uid(),
    from_id: from,
    to_id: to,
    type,
    notes: null,
    origin,
    ...ts(d),
  })
  const relationships: Row[] = [
    rel('e-borges', 'e-ficciones', 'escribio', 14),
    rel('e-cortazar', 'e-rayuela', 'escribio', 12),
    rel('e-borges', 'e-cortazar', 'influyo', 11, ai),
    rel('e-ficciones', 'e-laberinto', 'menciona', 9),
    rel('e-rayuela', 'e-laberinto', 'menciona', 8),
  ]

  const quote = (
    entity: string,
    text: string,
    source: string,
    d: number,
    extra: Partial<Row> = {},
  ): Row => ({
    id: uid(),
    entity_id: entity,
    text,
    source,
    context: null,
    link: null,
    user_reflection: null,
    linked_quote_ids: [],
    pinned_at: null,
    resonance: null,
    origin: manual,
    ...ts(d),
    ...extra,
  })
  const quotes: Row[] = [
    quote(
      'e-borges',
      'Siempre imaginé que el Paraíso sería algún tipo de biblioteca.',
      'El libro de arena',
      18,
      { pinned_at: daysAgo(2), resonance: 5 },
    ),
    quote(
      'e-borges',
      'Uno no es lo que es por lo que escribe, sino por lo que ha leído.',
      'Entrevistas',
      13,
      { resonance: 4 },
    ),
    quote(
      'e-cortazar',
      'Andábamos sin buscarnos pero sabiendo que andábamos para encontrarnos.',
      'Rayuela',
      10,
      { resonance: 4, user_reflection: 'La amistad como deriva.' },
    ),
    quote(
      'e-cortazar',
      'Nada está perdido si se tiene el valor de proclamar que todo está perdido.',
      'Rayuela',
      7,
    ),
  ]

  const momentos: Row[] = [
    {
      id: uid(),
      kind: 'nota',
      captured_at: daysAgo(5),
      payload: {
        bodyText:
          'Releer Ficciones con calma este invierno. El jardín de senderos que se bifurcan sigue abriendo puertas.',
      },
      note: null,
      origin: manual,
      entity_ids: ['e-borges', 'e-ficciones'],
      ...ts(5),
    },
    {
      id: uid(),
      kind: 'recorte',
      captured_at: daysAgo(3),
      payload: {
        title: 'Sobre la relectura',
        url: 'https://example.com/relectura',
        bodyText: 'Un texto nunca se lee dos veces igual.',
      },
      note: 'guardar para el ensayo',
      origin: manual,
      entity_ids: ['e-laberinto'],
      ...ts(3),
    },
    {
      id: uid(),
      kind: 'foto',
      captured_at: daysAgo(1),
      payload: {
        caption: 'Cuaderno abierto',
        items: [{ storageKey: 'demo/cuaderno.svg', width: 1200, height: 800 }],
        storageKey: 'demo/cuaderno.svg',
        width: 1200,
        height: 800,
        audioKey: 'demo/nota-voz.wav',
      },
      note: 'Una nota de voz breve para probar el reproductor.',
      origin: manual,
      entity_ids: ['e-borges'],
      ...ts(1),
    },
    {
      // Aspect vertical: alimenta el mosaico del álbum (masonry) con alturas
      // distintas y el mismo día que el cuaderno para encadenar el hilo.
      id: uid(),
      kind: 'foto',
      captured_at: daysAgo(1),
      payload: {
        caption: 'La ventana del estudio',
        items: [{ storageKey: 'demo/estudio-2.svg', width: 800, height: 1200 }],
        storageKey: 'demo/estudio-2.svg',
        width: 800,
        height: 1200,
      },
      note: null,
      origin: manual,
      entity_ids: [],
      ...ts(1),
    },
    {
      // Aspect cuadrado, otro día y otra paleta: variedad para el mosaico.
      id: uid(),
      kind: 'foto',
      captured_at: daysAgo(4),
      payload: {
        caption: 'Café de la tarde',
        items: [{ storageKey: 'demo/cafe-3.svg', width: 1000, height: 1000 }],
        storageKey: 'demo/cafe-3.svg',
        width: 1000,
        height: 1000,
      },
      note: null,
      origin: manual,
      entity_ids: [],
      ...ts(4),
    },
  ]

  const note = (content: string, d: number, pinned = false): Row => ({
    id: uid(),
    content,
    tags: parseTags(content),
    pinned,
    promoted_momento_id: null,
    origin: manual,
    ...ts(d),
  })
  // Nota de voz transcrita por WhatsApp: trae su audio adjunto re-escuchable.
  const voiceNoteId = uid()
  const voiceNote: Row = {
    id: voiceNoteId,
    content: 'Acordarme de comprar pan y leche camino a casa.',
    tags: parseTags('Acordarme de comprar pan y leche camino a casa.'),
    pinned: false,
    promoted_momento_id: null,
    origin: manual,
    source: 'whatsapp',
    ...ts(0),
  }
  const notes: Row[] = [
    voiceNote,
    note('Idea para el ensayo sobre #memoria y olvido en Borges.', 1, true),
    note('Releer el final de #Rayuela — el tablero y los puentes.', 2),
    note('Comprar la edición anotada de #Ficciones.', 4),
    note('Cita pendiente de verificar sobre el #laberinto.', 7),
  ]

  const task = (title: string, d: number, extra: Partial<Row> = {}): Row => ({
    id: uid(),
    title,
    detail: null,
    done: false,
    due_date: null,
    priority: 'media',
    week_start: weekStartAgo(d),
    category: 'trabajo',
    completed_at: null,
    tags: parseTags(title),
    origin: manual,
    ...ts(d),
    ...extra,
  })
  const thisWeek = weekStartAgo(0)
  const lastWeek = weekStartAgo(7)
  const tasks: Row[] = [
    task('Terminar el ensayo sobre #memoria', 1, {
      detail: 'Revisar las citas marcadas como resonantes.',
      priority: 'alta',
      week_start: thisWeek,
    }),
    task('Responder el correo de la editorial', 1, {
      priority: 'alta',
      due_date: dateAgo(-2),
      week_start: thisWeek,
    }),
    task('Ordenar las #notas de la semana', 2, {
      priority: 'media',
      week_start: thisWeek,
      // Capturada "tarea: …" desde WhatsApp → muestra el iconito de procedencia.
      origin: { kind: 'manual', importedFrom: 'whatsapp' },
    }),
    task('Comprar tinta para la #pluma', 2, {
      priority: 'baja',
      week_start: thisWeek,
      category: 'personal',
    }),
    task('Llamar a la biblioteca por el préstamo', 8, {
      priority: 'media',
      week_start: lastWeek,
      category: 'personal',
    }),
    task('Leer un capítulo de Rayuela', 8, {
      done: true,
      completed_at: daysAgo(6),
      week_start: lastWeek,
    }),
  ]

  const imageRecorte = (text: string, d: number): Row => ({
    id: uid(),
    text,
    source_url: null,
    source_title: null,
    source_author: null,
    note: null,
    image_url: null,
    image_key: 'demo/captura.svg',
    capture_mode: 'image',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    source: 'whatsapp',
    captured_at: daysAgo(d),
    created_at: daysAgo(d),
    updated_at: daysAgo(d),
  })
  // Recorte-evento: varias fotos de un mismo mensaje guardadas como una entrada.
  // La portada es image_key; `images[]` trae todas (espejo de recorte_images).
  const eventRecorte: Row = {
    id: uid(),
    text: '📸 3 imágenes desde WhatsApp',
    source_url: null,
    source_title: null,
    source_author: null,
    note: null,
    image_url: null,
    image_key: 'demo/captura.svg',
    images: [
      { storage_key: 'demo/captura.svg' },
      { storage_key: 'demo/captura-2.svg' },
      { storage_key: 'demo/captura-3.svg' },
    ],
    capture_mode: 'image',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    source: 'whatsapp',
    captured_at: daysAgo(0),
    created_at: daysAgo(0),
    updated_at: daysAgo(0),
  }
  const recortes: Row[] = [
    eventRecorte,
    imageRecorte('El dibujo del gato sobre la mesa', 0),
    imageRecorte('Boceto de la terraza', 1),
    imageRecorte('Página del cuaderno de viaje', 2),
    {
      id: uid(),
      text: 'La memoria no es un archivo sino un taller: cada recuerdo se reescribe al ser convocado.',
      source_url: 'https://example.com/ensayo-memoria',
      source_title: 'El taller de la memoria',
      source_author: 'Revista Otra Parte',
      note: 'conecta con lo de Borges y el olvido',
      image_url: null,
      image_key: null,
      capture_mode: 'citation',
      status: 'pending',
      promoted_target: null,
      promoted_id: null,
      captured_at: daysAgo(1),
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
    },
    {
      id: uid(),
      text: 'Leer es siempre releer, incluso la primera vez.',
      source_url: 'https://example.com/sobre-releer',
      source_title: 'Sobre releer',
      source_author: null,
      note: null,
      image_url: null,
      image_key: null,
      capture_mode: 'citation',
      status: 'pending',
      promoted_target: null,
      promoted_id: null,
      captured_at: daysAgo(3),
      created_at: daysAgo(3),
      updated_at: daysAgo(3),
    },
    {
      id: uid(),
      text: '## El cuaderno como taller\n\nEscribir a mano obliga a una lentitud que el teclado disuelve. La página guarda los titubeos: tachaduras, flechas, una palabra dudada.\n\n- La nota no es un archivo, es un gesto.\n- Releer la propia letra es reencontrarse.',
      source_url: 'https://example.com/cuaderno-taller',
      source_title: 'El cuaderno como taller',
      source_author: 'Cuadernos de lectura',
      note: 'guardé la página entera para releerla con calma',
      image_url: null,
      image_key: null,
      capture_mode: 'html',
      status: 'pending',
      promoted_target: null,
      promoted_id: null,
      captured_at: daysAgo(2),
      created_at: daysAgo(2),
      updated_at: daysAgo(2),
    },
  ]

  const favoritos: Row[] = [
    {
      id: uid(),
      url: 'https://www.youtube.com/watch?v=jNQXAC9k7QE',
      title: 'Me at the zoo — el primer video de YouTube',
      note: 'la miniatura se asocia sola',
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
    },
    {
      id: uid(),
      url: 'https://www.gutenberg.org/',
      title: 'Project Gutenberg — biblioteca de dominio público',
      note: 'para buscar ediciones viejas',
      created_at: daysAgo(2),
      updated_at: daysAgo(2),
    },
    {
      id: uid(),
      url: 'https://example.com/ensayo-largo-pendiente',
      title: 'Un ensayo largo que dejé a medias',
      note: null,
      created_at: daysAgo(5),
      updated_at: daysAgo(5),
    },
  ]

  const readingTables: Row[] = [
    {
      id: uid(),
      title: 'Ensayo sobre la memoria y el olvido',
      material_ids: [],
      draft_markdown:
        '# La memoria como construcción\n\nUna tesis provisional sobre cómo lo que olvidamos también nos define.',
      status: 'borrador',
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
    },
  ]

  // La biblioteca de prompts estaba vacía en la demo, así que la sección
  // nunca mostraba de qué va. Uno de ellos llega con historial para que el
  // versionado se vea sin tener que editar nada primero.
  const promptSintesis = uid()
  const prompts: Row[] = [
    {
      id: promptSintesis,
      title: 'Síntesis de lectura',
      content:
        'Lee {{texto}} y devuélveme tres cosas:\n\n1. La tesis en una frase.\n2. Los dos argumentos que la sostienen.\n3. Qué objeción le harías.\n\nSin resumir de más: prefiero que falte a que sobre.',
      collection: 'Investigación',
      tags: [],
      variables: ['texto'],
      favorite: true,
      use_count: 14,
      last_used_at: daysAgo(1),
      created_at: daysAgo(40),
      updated_at: daysAgo(3),
      deleted_at: null,
    },
    {
      id: uid(),
      title: 'Reescribir sin adjetivos',
      content:
        'Reescribe {{parrafo}} quitando todos los adjetivos que no aporten información. Si al quitarlo la frase dice lo mismo, sobraba.',
      collection: 'Escritura',
      tags: [],
      variables: ['parrafo'],
      favorite: false,
      use_count: 7,
      last_used_at: daysAgo(4),
      ...ts(22),
      deleted_at: null,
    },
    {
      id: uid(),
      title: 'Preguntas para una entrevista',
      content:
        'Voy a entrevistar a {{persona}} sobre {{tema}}. Dame ocho preguntas: dos de contexto, cuatro que la obliguen a concretar y dos incómodas pero justas.',
      collection: 'Investigación',
      tags: [],
      variables: ['persona', 'tema'],
      favorite: false,
      use_count: 3,
      last_used_at: null,
      ...ts(9),
      deleted_at: null,
    },
    {
      id: uid(),
      title: 'Traducir manteniendo el ritmo',
      content:
        'Traduce {{fragmento}} al español. Prioriza el ritmo de la frase sobre la literalidad: si hay que cambiar el orden para que suene, cámbialo.',
      collection: null,
      tags: [],
      variables: ['fragmento'],
      favorite: false,
      use_count: 1,
      last_used_at: null,
      ...ts(2),
      deleted_at: null,
    },
  ]

  // Dos ediciones previas del primero: cada fila guarda el texto que había
  // ANTES del cambio, de la más reciente a la más antigua.
  const promptVersions: Row[] = [
    {
      id: uid(),
      prompt_id: promptSintesis,
      title: 'Síntesis de lectura',
      content:
        'Lee {{texto}} y devuélveme tres cosas:\n\n1. La tesis en una frase.\n2. Los dos argumentos que la sostienen.\n3. Qué objeción le harías.',
      collection: 'Investigación',
      created_at: daysAgo(3),
      updated_at: daysAgo(3),
      deleted_at: null,
    },
    {
      id: uid(),
      prompt_id: promptSintesis,
      title: 'Resumen de lectura',
      content: 'Resume {{texto}} en tres puntos.',
      collection: 'Investigación',
      created_at: daysAgo(18),
      updated_at: daysAgo(18),
      deleted_at: null,
    },
  ]

  return {
    entities,
    relationships,
    quotes,
    momentos,
    notes,
    tasks,
    prompts,
    prompt_versions: promptVersions,
    secrets: [],
    notas_attachments: [
      {
        id: uid(),
        owner_type: 'note',
        owner_id: voiceNoteId,
        file_name: 'nota-de-voz.wav',
        mime_type: 'audio/ogg',
        byte_size: 12000,
        storage_key: 'demo/voz.wav',
        ...ts(0),
      },
    ],
    pdf_stamp_assets: [],
    recortes,
    favoritos,
    'reading-tables': readingTables,
    momento_comments: [],
    momento_reactions: [],
    month_notes: [],
    x_bookmarks: X_BOOKMARKS_SEED.map((r) => ({ ...r })),
    user_prefs: {},
  }
}

/**
 * Bookmarks de X del modo demo. Variados a propósito en autor, tema y año: son
 * las tres facetas que la vista ofrece como filtro, y con una sola combinación
 * no habría nada que filtrar. Viven en el store —no como constante— para que
 * «quitar bookmark» borre de verdad; sincronizar y clasificar siguen inertes,
 * que sí necesitan la app de X y red real.
 */
export const X_BOOKMARKS_SEED: Row[] = [
  {
    id: 'xb1',
    tweetId: '1',
    text: 'La memoria no archiva: reescribe. Cada vez que recuerdas algo, lo editas un poco.',
    authorName: 'Ana Iribarren',
    authorUsername: 'anairib',
    tweetCreatedAt: '2026-06-18T08:30:00.000Z',
    url: 'https://x.com/anairib/status/1',
    capturedAt: '2026-06-18T09:00:00.000Z',
    created_at: '2026-06-18T09:00:00.000Z',
    updated_at: '2026-06-18T09:00:00.000Z',
    deleted_at: null,
    topic: 'memoria',
  },
  {
    id: 'xb2',
    tweetId: '2',
    text: 'Un buen sistema de notas no te hace recordar más. Te hace olvidar sin miedo.',
    authorName: 'Tomás Vera',
    authorUsername: 'tvera',
    tweetCreatedAt: '2026-05-02T14:10:00.000Z',
    url: 'https://x.com/tvera/status/2',
    capturedAt: '2026-05-02T14:40:00.000Z',
    created_at: '2026-05-02T14:40:00.000Z',
    updated_at: '2026-05-02T14:40:00.000Z',
    deleted_at: null,
    topic: 'método',
  },
  {
    id: 'xb3',
    tweetId: '3',
    text: 'Leer dos libros a la vez sobre el mismo tema es la forma más rápida de dejar de creerle a uno.',
    authorName: 'Ana Iribarren',
    authorUsername: 'anairib',
    tweetCreatedAt: '2026-03-11T19:05:00.000Z',
    url: 'https://x.com/anairib/status/3',
    capturedAt: '2026-03-11T19:20:00.000Z',
    created_at: '2026-03-11T19:20:00.000Z',
    updated_at: '2026-03-11T19:20:00.000Z',
    deleted_at: null,
    topic: 'lectura',
  },
  {
    id: 'xb4',
    tweetId: '4',
    text: 'Toda interfaz enseña una teoría de la atención. La mayoría enseña que no vale nada.',
    authorName: 'Lena Ferrer',
    authorUsername: 'lenaferrer',
    tweetCreatedAt: '2025-11-27T10:00:00.000Z',
    url: 'https://x.com/lenaferrer/status/4',
    capturedAt: '2025-11-27T10:30:00.000Z',
    created_at: '2025-11-27T10:30:00.000Z',
    updated_at: '2025-11-27T10:30:00.000Z',
    deleted_at: null,
    topic: 'diseño',
  },
  {
    id: 'xb5',
    tweetId: '5',
    text: 'Guardo cosas que no voy a leer. El gesto de guardar ya es una forma de pensar.',
    authorName: 'Tomás Vera',
    authorUsername: 'tvera',
    tweetCreatedAt: '2025-08-09T22:45:00.000Z',
    url: 'https://x.com/tvera/status/5',
    capturedAt: '2025-08-09T23:00:00.000Z',
    created_at: '2025-08-09T23:00:00.000Z',
    updated_at: '2025-08-09T23:00:00.000Z',
    deleted_at: null,
    topic: 'método',
  },
  {
    id: 'xb6',
    tweetId: '6',
    text: 'Nadie tiene un problema de organización. Todos tenemos un problema de decidir qué importa.',
    authorName: 'Lena Ferrer',
    authorUsername: 'lenaferrer',
    tweetCreatedAt: '2025-04-14T07:20:00.000Z',
    url: 'https://x.com/lenaferrer/status/6',
    capturedAt: '2025-04-14T07:50:00.000Z',
    created_at: '2025-04-14T07:50:00.000Z',
    updated_at: '2025-04-14T07:50:00.000Z',
    deleted_at: null,
    topic: null,
  },
]
