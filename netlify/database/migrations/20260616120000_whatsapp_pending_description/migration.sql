-- Estado conversacional: "esperando descripción".
--
-- Cuando se captura una foto SIN pie (recorte/momento), el bot ofrece agregar
-- una descripción y el SIGUIENTE texto libre del número se aplica a esa captura.
-- Para saber a qué captura apunta ese texto (que llega en otro mensaje, sin
-- contexto), guardamos un puntero acá, con su instante para vencerlo por ventana.
--
-- Es efímero por diseño: lo setea la captura sin pie, lo consume/limpia el texto
-- siguiente, y si vence (ventana) simplemente se ignora. No lleva RLS propio: las
-- políticas existentes de whatsapp_links ya cubren todas sus columnas.

ALTER TABLE whatsapp_links
  ADD COLUMN IF NOT EXISTS awaiting_desc_kind TEXT,
  ADD COLUMN IF NOT EXISTS awaiting_desc_id UUID,
  ADD COLUMN IF NOT EXISTS awaiting_desc_at TIMESTAMPTZ;
