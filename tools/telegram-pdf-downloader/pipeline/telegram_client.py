"""Acceso a Telegram vía Telethon (MTProto, sesión de usuario)."""

from __future__ import annotations

from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeFilename, InputMessagesFilterDocument


def crear_cliente(config) -> TelegramClient:
    sesion = config.carpeta_datos / "sesion_telegram"
    cliente = TelegramClient(str(sesion), config.api_id, config.api_hash)
    # Ante un FloodWait de Telegram, esperar en vez de abortar (hasta 24 h).
    cliente.flood_sleep_threshold = 24 * 3600
    return cliente


async def mensajes_nuevos(cliente: TelegramClient, entidad, ultimo_id: int, limite_inicial: int) -> list:
    """Documentos posteriores al último procesado, ordenados de antiguo a nuevo.

    En la primera pasada (ultimo_id == 0) se limita a los `limite_inicial`
    documentos más recientes para no bajar historiales gigantes de golpe;
    con 0 se baja todo el historial.
    """
    limite = limite_inicial if (ultimo_id == 0 and limite_inicial > 0) else None
    mensajes = []
    async for mensaje in cliente.iter_messages(
        entidad,
        min_id=ultimo_id,
        limit=limite,
        filter=InputMessagesFilterDocument(),
    ):
        mensajes.append(mensaje)
    mensajes.reverse()
    return mensajes


def es_pdf(mensaje) -> bool:
    documento = getattr(mensaje, "document", None)
    return bool(documento and documento.mime_type == "application/pdf")


def nombre_original(mensaje) -> str | None:
    documento = getattr(mensaje, "document", None)
    if not documento:
        return None
    for atributo in documento.attributes:
        if isinstance(atributo, DocumentAttributeFilename):
            return atributo.file_name
    return None
