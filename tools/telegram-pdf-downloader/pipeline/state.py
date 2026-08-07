"""Registro persistente en SQLite: mensajes procesados y archivos guardados."""

from __future__ import annotations

import sqlite3
from pathlib import Path

ESQUEMA = """
CREATE TABLE IF NOT EXISTS chats (
    chat_id INTEGER PRIMARY KEY,
    ultimo_mensaje_id INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS archivos (
    hash TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    mensaje_id INTEGER NOT NULL,
    ruta_final TEXT NOT NULL,
    titulo TEXT,
    revista TEXT,
    anio INTEGER,
    categoria TEXT,
    procesado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def abrir(ruta: Path | str) -> sqlite3.Connection:
    conn = sqlite3.connect(str(ruta))
    conn.executescript(ESQUEMA)
    conn.commit()
    return conn


def ultimo_mensaje(conn: sqlite3.Connection, chat_id: int) -> int:
    fila = conn.execute(
        "SELECT ultimo_mensaje_id FROM chats WHERE chat_id = ?", (chat_id,)
    ).fetchone()
    return fila[0] if fila else 0


def marcar_mensaje(conn: sqlite3.Connection, chat_id: int, mensaje_id: int) -> None:
    """Avanza el puntero del chat; nunca retrocede (MAX)."""
    conn.execute(
        """
        INSERT INTO chats (chat_id, ultimo_mensaje_id) VALUES (?, ?)
        ON CONFLICT(chat_id) DO UPDATE
        SET ultimo_mensaje_id = MAX(ultimo_mensaje_id, excluded.ultimo_mensaje_id)
        """,
        (chat_id, mensaje_id),
    )
    conn.commit()


def hash_existe(conn: sqlite3.Connection, hash_archivo: str) -> bool:
    fila = conn.execute(
        "SELECT 1 FROM archivos WHERE hash = ?", (hash_archivo,)
    ).fetchone()
    return fila is not None


def registrar_archivo(
    conn: sqlite3.Connection,
    hash_archivo: str,
    chat_id: int,
    mensaje_id: int,
    ruta_final: str,
    titulo: str | None,
    revista: str | None,
    anio: int | None,
    categoria: str | None,
) -> None:
    conn.execute(
        """
        INSERT INTO archivos (hash, chat_id, mensaje_id, ruta_final, titulo, revista, anio, categoria)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (hash_archivo, chat_id, mensaje_id, ruta_final, titulo, revista, anio, categoria),
    )
    conn.commit()


def resumen(conn: sqlite3.Connection) -> dict[str, int]:
    """Cantidad de archivos guardados por categoría."""
    filas = conn.execute(
        "SELECT COALESCE(categoria, 'Sin clasificar'), COUNT(*) FROM archivos GROUP BY 1 ORDER BY 2 DESC"
    ).fetchall()
    return {categoria: cantidad for categoria, cantidad in filas}
