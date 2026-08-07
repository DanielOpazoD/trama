"""Extracción de metadatos y clasificación temática con la API de Claude.

Una sola llamada resuelve las dos cosas: {titulo, revista, anio, categoria}.
La salida está garantizada por el esquema JSON (salidas estructuradas).
"""

from __future__ import annotations

import json
import logging

import anthropic

log = logging.getLogger("trama-pdf")

INSTRUCCIONES = """Eres un bibliotecario médico. Recibirás el texto de la primera página de un artículo científico de medicina.

Extrae los metadatos y clasifica el artículo:
- titulo: el título completo del artículo, en su idioma original.
- revista: el nombre de la revista, abreviado si tiene sigla conocida (NEJM, JAMA, Lancet, BMJ...).
- anio: el año de publicación.
- categoria: exactamente una de las categorías de la lista; si ninguna calza bien, usa la última de la lista.

Si te entrego metadatos confirmados vía CrossRef, úsalos tal cual para titulo, revista y anio (solo ajusta la revista a su sigla si corresponde)."""


def crear_cliente(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key)


def construir_esquema(categorias: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "titulo": {"type": "string", "description": "Título completo del artículo"},
            "revista": {"type": "string", "description": "Revista, abreviada si tiene sigla conocida"},
            "anio": {"type": "integer", "description": "Año de publicación"},
            "categoria": {"type": "string", "enum": categorias},
        },
        "required": ["titulo", "revista", "anio", "categoria"],
        "additionalProperties": False,
    }


def analizar(
    cliente: anthropic.Anthropic,
    texto_primera_pagina: str,
    referencia_crossref: dict | None,
    categorias: list[str],
    modelo: str,
) -> dict | None:
    """Devuelve {titulo, revista, anio, categoria} o None si la llamada falla."""
    bloques = [INSTRUCCIONES, "", "Categorías disponibles:"]
    bloques += [f"- {c}" for c in categorias]
    if referencia_crossref:
        bloques += ["", "Metadatos confirmados vía CrossRef:", json.dumps(referencia_crossref, ensure_ascii=False)]
    bloques += ["", "Texto de la primera página:", texto_primera_pagina]

    try:
        respuesta = cliente.messages.create(
            model=modelo,
            max_tokens=1024,
            output_config={"format": {"type": "json_schema", "schema": construir_esquema(categorias)}},
            messages=[{"role": "user", "content": "\n".join(bloques)}],
        )
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
        log.warning("Llamada a Claude falló (%s); se usará el respaldo sin IA.", exc.__class__.__name__)
        return None

    if respuesta.stop_reason == "refusal":
        log.warning("Claude declinó analizar este documento; se usará el respaldo sin IA.")
        return None

    try:
        return json.loads(respuesta.content[0].text)
    except (IndexError, AttributeError, json.JSONDecodeError) as exc:
        log.warning("Respuesta de Claude no parseable: %s", exc)
        return None
