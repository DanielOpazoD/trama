#!/usr/bin/env python3
"""Descarga PDFs de artículos médicos desde grupos de Telegram, los renombra
según título/revista/año y los clasifica por temática en carpetas locales.

Comandos:
  login   Primer inicio de sesión en Telegram (interactivo, una sola vez).
  run     Revisa los grupos, descarga lo nuevo y lo organiza.
  status  Resumen de lo ya procesado.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import sys
from pathlib import Path

from pipeline import classify, metadata, organize, state
from pipeline.config import Config, cargar_config
from pipeline.telegram_client import crear_cliente, es_pdf, mensajes_nuevos, nombre_original

log = logging.getLogger("trama-pdf")


def hash_archivo(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


async def procesar_mensaje(mensaje, chat_id: int, conn, config: Config, cliente_claude, tmp_dir: Path) -> bool:
    """Descarga, deduplica, extrae metadatos, renombra y archiva un PDF.

    Devuelve True si se guardó un archivo nuevo.
    """
    original = nombre_original(mensaje) or f"mensaje_{mensaje.id}.pdf"
    ruta_tmp = tmp_dir / f"{chat_id}_{mensaje.id}.pdf"
    await mensaje.download_media(file=str(ruta_tmp))

    huella = hash_archivo(ruta_tmp)
    if state.hash_existe(conn, huella):
        ruta_tmp.unlink()
        log.info("Duplicado, ya guardado antes: %s", original)
        return False

    try:
        texto = metadata.extraer_texto(ruta_tmp)
    except Exception as exc:  # PDF corrupto o ilegible: se archiva igual, sin metadatos
        log.warning("No se pudo leer el texto de %s: %s", original, exc)
        texto = ""

    doi = metadata.extraer_doi(texto)
    referencia = metadata.consultar_crossref(doi, config.crossref_mailto) if doi else None

    datos = None
    if cliente_claude and texto.strip():
        datos = classify.analizar(
            cliente_claude,
            texto[:6000],
            referencia,
            config.categorias_completas,
            config.modelo,
        )
    if datos is None:
        base = referencia or {}
        datos = {
            "titulo": base.get("titulo"),
            "revista": base.get("revista"),
            "anio": base.get("anio"),
            "categoria": config.categoria_sin_clasificar,
        }

    nombre = organize.construir_nombre(
        datos.get("titulo"), datos.get("revista"), datos.get("anio"), nombre_original=original
    )
    categoria = datos.get("categoria") or config.categoria_sin_clasificar
    destino = organize.mover(ruta_tmp, config.carpeta_destino, categoria, nombre)
    state.registrar_archivo(
        conn, huella, chat_id, mensaje.id, str(destino),
        datos.get("titulo"), datos.get("revista"), datos.get("anio"), categoria,
    )
    log.info("Guardado: %s", destino)
    return True


async def comando_run(config: Config) -> int:
    conn = state.abrir(config.carpeta_datos / "estado.db")
    tmp_dir = config.carpeta_datos / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    cliente_claude = None
    if config.anthropic_api_key:
        cliente_claude = classify.crear_cliente(config.anthropic_api_key)
    else:
        log.warning(
            "Sin ANTHROPIC_API_KEY: se usará solo CrossRef para los nombres "
            "y todo irá a la carpeta '%s'.", config.categoria_sin_clasificar,
        )

    cliente = crear_cliente(config)
    await cliente.connect()
    try:
        if not await cliente.is_user_authorized():
            log.error("Sesión de Telegram no iniciada. Corre primero: python3 main.py login")
            return 1

        guardados = 0
        for grupo in config.grupos:
            try:
                entidad = await cliente.get_entity(grupo)
            except Exception as exc:
                log.error("No se pudo resolver el grupo %s: %s", grupo, exc)
                continue
            chat_id = entidad.id
            ultimo = state.ultimo_mensaje(conn, chat_id)
            mensajes = await mensajes_nuevos(cliente, entidad, ultimo, config.limite_historial)
            log.info("Grupo %s: %d documentos por revisar", grupo, len(mensajes))

            for mensaje in mensajes:
                try:
                    if es_pdf(mensaje):
                        if await procesar_mensaje(mensaje, chat_id, conn, config, cliente_claude, tmp_dir):
                            guardados += 1
                except Exception:
                    log.exception("Error procesando el mensaje %d de %s; se continúa.", mensaje.id, grupo)
                finally:
                    state.marcar_mensaje(conn, chat_id, mensaje.id)

        log.info("Listo: %d artículos nuevos guardados en %s", guardados, config.carpeta_destino)
        return 0
    finally:
        await cliente.disconnect()
        conn.close()


async def comando_login(config: Config) -> int:
    cliente = crear_cliente(config)
    await cliente.start()  # pide teléfono y código de verificación por consola
    yo = await cliente.get_me()
    print(f"Sesión iniciada como {yo.first_name} (id {yo.id}). Ya puedes usar: python3 main.py run")
    await cliente.disconnect()
    return 0


def comando_status(config: Config) -> int:
    ruta_db = config.carpeta_datos / "estado.db"
    if not ruta_db.exists():
        print("Todavía no se ha procesado nada.")
        return 0
    conn = state.abrir(ruta_db)
    try:
        por_categoria = state.resumen(conn)
        total = sum(por_categoria.values())
        print(f"Artículos guardados: {total}")
        for categoria, cantidad in por_categoria.items():
            print(f"  {categoria}: {cantidad}")
    finally:
        conn.close()
    return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("comando", choices=["login", "run", "status"])
    argumentos = parser.parse_args()

    config = cargar_config()
    if argumentos.comando == "login":
        return asyncio.run(comando_login(config))
    if argumentos.comando == "run":
        return asyncio.run(comando_run(config))
    return comando_status(config)


if __name__ == "__main__":
    sys.exit(main())
