"""Carga de configuración: config.yaml + credenciales en .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent


@dataclass
class Config:
    grupos: list[str]
    limite_historial: int
    carpeta_destino: Path
    carpeta_datos: Path
    modelo: str
    categorias: list[str]
    categoria_sin_clasificar: str
    api_id: int
    api_hash: str
    anthropic_api_key: str | None
    crossref_mailto: str | None

    @property
    def categorias_completas(self) -> list[str]:
        """Categorías válidas para el clasificador, incluida la de respaldo."""
        completas = list(self.categorias)
        if self.categoria_sin_clasificar not in completas:
            completas.append(self.categoria_sin_clasificar)
        return completas


def cargar_env(ruta: Path) -> None:
    """Carga un .env simple (KEY=valor) sin pisar variables ya definidas."""
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        clave = clave.strip()
        valor = valor.strip().strip("'\"")
        if clave and clave not in os.environ:
            os.environ[clave] = valor


def cargar_config(ruta_yaml: Path | None = None) -> Config:
    cargar_env(RAIZ / ".env")

    ruta_yaml = ruta_yaml or RAIZ / "config.yaml"
    if not ruta_yaml.exists():
        raise SystemExit(
            f"No existe {ruta_yaml}. Copia config.example.yaml a config.yaml y edítalo."
        )
    datos = yaml.safe_load(ruta_yaml.read_text(encoding="utf-8")) or {}

    telegram = datos.get("telegram") or {}
    descargas = datos.get("descargas") or {}
    clasificacion = datos.get("clasificacion") or {}

    grupos = telegram.get("grupos") or []
    if not grupos:
        raise SystemExit("config.yaml no define ningún grupo en telegram.grupos.")

    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        raise SystemExit(
            "Faltan TELEGRAM_API_ID / TELEGRAM_API_HASH. "
            "Consíguelos en https://my.telegram.org y ponlos en el archivo .env."
        )

    carpeta_datos = Path(
        os.path.expanduser(descargas.get("carpeta_datos") or "~/.trama-telegram-pdf")
    )
    carpeta_datos.mkdir(parents=True, exist_ok=True)

    return Config(
        grupos=[str(g) for g in grupos],
        limite_historial=int(telegram.get("limite_historial", 500)),
        carpeta_destino=Path(os.path.expanduser(str(descargas.get("carpeta_destino", "~/ArticulosMedicina")))),
        carpeta_datos=carpeta_datos,
        modelo=str(clasificacion.get("modelo", "claude-haiku-4-5")),
        categorias=[str(c) for c in (clasificacion.get("categorias") or [])],
        categoria_sin_clasificar=str(clasificacion.get("categoria_sin_clasificar", "Sin clasificar")),
        api_id=int(api_id),
        api_hash=str(api_hash),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY") or None,
        crossref_mailto=os.environ.get("CROSSREF_MAILTO") or None,
    )
