import unittest

from pipeline import state


class TestState(unittest.TestCase):
    def setUp(self):
        self.conn = state.abrir(":memory:")

    def tearDown(self):
        self.conn.close()

    def test_ultimo_mensaje_parte_en_cero(self):
        self.assertEqual(state.ultimo_mensaje(self.conn, 123), 0)

    def test_marcar_avanza_y_nunca_retrocede(self):
        state.marcar_mensaje(self.conn, 123, 50)
        state.marcar_mensaje(self.conn, 123, 80)
        state.marcar_mensaje(self.conn, 123, 60)  # fuera de orden: no retrocede
        self.assertEqual(state.ultimo_mensaje(self.conn, 123), 80)

    def test_dedupe_por_hash(self):
        self.assertFalse(state.hash_existe(self.conn, "abc"))
        state.registrar_archivo(
            self.conn, "abc", 123, 7, "/tmp/x.pdf", "Título", "NEJM", 2024, "Cardiología"
        )
        self.assertTrue(state.hash_existe(self.conn, "abc"))

    def test_resumen_por_categoria(self):
        state.registrar_archivo(self.conn, "h1", 1, 1, "/a", None, None, None, "Cardiología")
        state.registrar_archivo(self.conn, "h2", 1, 2, "/b", None, None, None, "Cardiología")
        state.registrar_archivo(self.conn, "h3", 1, 3, "/c", None, None, None, None)
        self.assertEqual(
            state.resumen(self.conn), {"Cardiología": 2, "Sin clasificar": 1}
        )


if __name__ == "__main__":
    unittest.main()
