"""Nombres de archivo limpios y movimiento a carpetas por categoría."""

from __future__ import annotations

import re
import shutil
import unicodedata
from pathlib import Path

CARACTERES_INVALIDOS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
ESPACIOS = re.compile(r"\s+")
LARGO_MAXIMO = 150  # largo del nombre sin la extensión


def limpiar(texto: str) -> str:
    """Deja el texto apto como nombre de archivo en macOS/Drive."""
    texto = unicodedata.normalize("NFC", texto)
    texto = CARACTERES_INVALIDOS.sub(" ", texto)
    texto = ESPACIOS.sub(" ", texto).strip()
    return texto.rstrip(" .")


def construir_nombre(
    titulo: str | None,
    revista: str | None,
    anio: int | None,
    nombre_original: str | None = None,
) -> str:
    """`2024 - NEJM - Semaglutide in Heart Failure.pdf`, tolerando datos faltantes."""
    partes = [str(p) for p in (anio, revista, titulo) if p]
    if partes:
        base = " - ".join(partes)
    else:
        base = Path(nombre_original).stem if nombre_original else "documento"
    base = limpiar(base) or "documento"
    if len(base) > LARGO_MAXIMO:
        base = base[:LARGO_MAXIMO].rstrip(" .-")
    return f"{base}.pdf"


def resolver_colision(destino: Path) -> Path:
    """Mismo nombre pero contenido distinto (el hash ya deduplicó): sufija (2), (3)..."""
    if not destino.exists():
        return destino
    contador = 2
    while True:
        candidato = destino.with_name(f"{destino.stem} ({contador}){destino.suffix}")
        if not candidato.exists():
            return candidato
        contador += 1


def mover(origen: Path, carpeta_base: Path, categoria: str, nombre: str) -> Path:
    carpeta = carpeta_base / (limpiar(categoria) or "Sin clasificar")
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = resolver_colision(carpeta / nombre)
    shutil.move(str(origen), str(destino))
    return destino
