import tempfile
import unittest
from pathlib import Path

from pipeline import organize


class TestLimpiar(unittest.TestCase):
    def test_quita_caracteres_invalidos(self):
        self.assertEqual(
            organize.limpiar('Sepsis: manejo <inicial> en "UCI"/urgencias'),
            "Sepsis manejo inicial en UCI urgencias",
        )

    def test_colapsa_espacios_y_puntos_finales(self):
        self.assertEqual(organize.limpiar("  Título   raro. . "), "Título raro")


class TestConstruirNombre(unittest.TestCase):
    def test_nombre_completo(self):
        self.assertEqual(
            organize.construir_nombre("Semaglutide in Heart Failure", "NEJM", 2024),
            "2024 - NEJM - Semaglutide in Heart Failure.pdf",
        )

    def test_sin_anio(self):
        self.assertEqual(
            organize.construir_nombre("Un título", "Lancet", None),
            "Lancet - Un título.pdf",
        )

    def test_sin_metadatos_usa_nombre_original(self):
        self.assertEqual(
            organize.construir_nombre(None, None, None, nombre_original="paper_final_v3.pdf"),
            "paper_final_v3.pdf",
        )

    def test_sin_nada(self):
        self.assertEqual(organize.construir_nombre(None, None, None), "documento.pdf")

    def test_trunca_titulos_larguisimos(self):
        nombre = organize.construir_nombre("x" * 400, "JAMA", 2023)
        self.assertLessEqual(len(nombre), organize.LARGO_MAXIMO + len(".pdf"))
        self.assertTrue(nombre.endswith(".pdf"))


class TestMover(unittest.TestCase):
    def test_mueve_y_resuelve_colisiones(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "destino"
            rutas = []
            for i in range(3):
                origen = Path(tmp) / f"origen_{i}.pdf"
                origen.write_bytes(b"%PDF-" + str(i).encode())
                rutas.append(organize.mover(origen, base, "Cardiología", "2024 - NEJM - Paper.pdf"))

            self.assertEqual(rutas[0], base / "Cardiología" / "2024 - NEJM - Paper.pdf")
            self.assertEqual(rutas[1].name, "2024 - NEJM - Paper (2).pdf")
            self.assertEqual(rutas[2].name, "2024 - NEJM - Paper (3).pdf")
            for ruta in rutas:
                self.assertTrue(ruta.exists())


if __name__ == "__main__":
    unittest.main()
