import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import requests

from pipeline import metadata


class TestExtraerDoi(unittest.TestCase):
    def test_doi_simple(self):
        texto = "N Engl J Med 2024. DOI: 10.1056/NEJMoa2206286"
        self.assertEqual(metadata.extraer_doi(texto), "10.1056/NEJMoa2206286")

    def test_doi_en_url_con_punto_final(self):
        texto = "Disponible en https://doi.org/10.1016/S0140-6736(23)01234-5."
        self.assertEqual(metadata.extraer_doi(texto), "10.1016/S0140-6736(23)01234-5")

    def test_sin_doi(self):
        self.assertIsNone(metadata.extraer_doi("texto sin identificadores"))


class TestConsultarCrossref(unittest.TestCase):
    def _respuesta(self, cuerpo):
        falsa = MagicMock()
        falsa.json.return_value = cuerpo
        falsa.raise_for_status.return_value = None
        return falsa

    def test_parsea_titulo_revista_anio(self):
        cuerpo = {
            "message": {
                "title": ["Semaglutide in Patients with Heart Failure"],
                "short-container-title": ["N Engl J Med"],
                "container-title": ["The New England Journal of Medicine"],
                "issued": {"date-parts": [[2024, 3, 14]]},
            }
        }
        with patch.object(metadata.requests, "get", return_value=self._respuesta(cuerpo)):
            resultado = metadata.consultar_crossref("10.1056/x")
        self.assertEqual(
            resultado,
            {
                "titulo": "Semaglutide in Patients with Heart Failure",
                "revista": "N Engl J Med",
                "anio": 2024,
            },
        )

    def test_error_de_red_devuelve_none(self):
        with patch.object(metadata.requests, "get", side_effect=requests.ConnectionError("sin red")):
            self.assertIsNone(metadata.consultar_crossref("10.1056/x"))


class TestExtraerTexto(unittest.TestCase):
    def test_lee_primeras_paginas_de_un_pdf_real(self):
        import pymupdf

        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "muestra.pdf"
            doc = pymupdf.open()
            pagina = doc.new_page()
            pagina.insert_text((72, 72), "Titulo de prueba DOI: 10.1000/prueba123")
            doc.save(str(ruta))
            doc.close()

            texto = metadata.extraer_texto(ruta)
            self.assertIn("Titulo de prueba", texto)
            self.assertEqual(metadata.extraer_doi(texto), "10.1000/prueba123")


if __name__ == "__main__":
    unittest.main()
