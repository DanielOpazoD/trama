"""Extracción de metadatos: texto del PDF, DOI y consulta a CrossRef."""

from __future__ import annotations

import logging
import re

import requests

log = logging.getLogger("trama-pdf")

DOI_RE = re.compile(r"\b10\.\d{4,9}/[^\s\"'<>]+")
_PUNTUACION_FINAL = ".,;:)]}>\"'"


def extraer_texto(ruta, max_paginas: int = 2) -> str:
    """Texto de las primeras páginas del PDF (donde vive título, revista y DOI)."""
    import pymupdf

    partes: list[str] = []
    with pymupdf.open(str(ruta)) as doc:
        for indice in range(min(max_paginas, doc.page_count)):
            partes.append(doc[indice].get_text())
    return "\n".join(partes)


def extraer_doi(texto: str) -> str | None:
    coincidencia = DOI_RE.search(texto)
    if not coincidencia:
        return None
    return coincidencia.group(0).rstrip(_PUNTUACION_FINAL)


def consultar_crossref(doi: str, mailto: str | None = None, timeout: int = 15) -> dict | None:
    """Metadatos canónicos del artículo vía CrossRef. Devuelve None si falla.

    CrossRef es gratuita y sin clave; el mailto opcional te mete en el
    "polite pool" (mejor prioridad de servicio).
    """
    agente = "trama-telegram-pdf-downloader/1.0"
    if mailto:
        agente += f" (mailto:{mailto})"
    try:
        respuesta = requests.get(
            f"https://api.crossref.org/works/{doi}",
            headers={"User-Agent": agente},
            timeout=timeout,
        )
        respuesta.raise_for_status()
        mensaje = respuesta.json()["message"]
    except (requests.RequestException, ValueError, KeyError) as exc:
        log.warning("CrossRef falló para DOI %s: %s", doi, exc)
        return None

    titulo = (mensaje.get("title") or [None])[0]
    revista = (mensaje.get("short-container-title") or mensaje.get("container-title") or [None])[0]

    anio = None
    for clave in ("issued", "published-print", "published-online"):
        partes = (mensaje.get(clave) or {}).get("date-parts") or []
        if partes and partes[0] and partes[0][0]:
            anio = int(partes[0][0])
            break

    if not any((titulo, revista, anio)):
        return None
    return {"titulo": titulo, "revista": revista, "anio": anio}
