import json
import unittest
from types import SimpleNamespace

import httpx

import anthropic

from pipeline import classify

CATEGORIAS = ["Cardiología", "Infectología", "Sin clasificar"]


def _cliente_falso(respuesta=None, excepcion=None):
    def create(**_kwargs):
        if excepcion:
            raise excepcion
        return respuesta

    return SimpleNamespace(messages=SimpleNamespace(create=create))


class TestConstruirEsquema(unittest.TestCase):
    def test_esquema_estricto_con_enum(self):
        esquema = classify.construir_esquema(CATEGORIAS)
        self.assertFalse(esquema["additionalProperties"])
        self.assertEqual(esquema["properties"]["categoria"]["enum"], CATEGORIAS)
        self.assertEqual(
            sorted(esquema["required"]), ["anio", "categoria", "revista", "titulo"]
        )


class TestAnalizar(unittest.TestCase):
    def test_parsea_respuesta_valida(self):
        datos = {"titulo": "T", "revista": "NEJM", "anio": 2024, "categoria": "Cardiología"}
        respuesta = SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(text=json.dumps(datos))],
        )
        resultado = classify.analizar(
            _cliente_falso(respuesta), "texto", None, CATEGORIAS, "claude-haiku-4-5"
        )
        self.assertEqual(resultado, datos)

    def test_refusal_devuelve_none(self):
        respuesta = SimpleNamespace(stop_reason="refusal", content=[])
        resultado = classify.analizar(
            _cliente_falso(respuesta), "texto", None, CATEGORIAS, "claude-haiku-4-5"
        )
        self.assertIsNone(resultado)

    def test_error_de_conexion_devuelve_none(self):
        excepcion = anthropic.APIConnectionError(
            request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        )
        resultado = classify.analizar(
            _cliente_falso(excepcion=excepcion), "texto", None, CATEGORIAS, "claude-haiku-4-5"
        )
        self.assertIsNone(resultado)


if __name__ == "__main__":
    unittest.main()
