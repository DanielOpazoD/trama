export type LayoutNode = {
  id: string
  type: string
  year?: number | null
}

export type LayoutEdge = {
  fromId: string
  toId: string
}

export type Position = { x: number; y: number }

export type LayoutResult = Map<string, Position>

export type LayoutMode = 'organic' | 'by-type' | 'by-year' | 'by-degree'
