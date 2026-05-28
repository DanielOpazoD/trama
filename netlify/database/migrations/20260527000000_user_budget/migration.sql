-- Per-user monthly LLM budget cap.
--
-- Hasta ahora `checkMonthlyBudget()` leía un env var global
-- `AI_MONTHLY_BUDGET_CENTS` y sumaba TODO el `extraction_log`. Con
-- multi-user real eso es problemático: un usuario podría agotar el
-- cap del resto.
--
-- Esta migración agrega `users.monthly_budget_cents` (nullable):
--   - NULL → usa el env var como fallback (comportamiento actual)
--   - integer > 0 → ese cap individual aplica a este usuario
--
-- El código de `checkMonthlyBudget` se actualiza por separado en el
-- mismo PR para preferir la columna sobre la env var cuando viene
-- un userId.
--
-- Backward-compatible al 100%: legacy-single-user queda con NULL y la
-- app sigue usando el cap global. Cuando un usuario real se cree (vía
-- Clerk), la creación del row en `users` puede setear este cap.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS monthly_budget_cents integer
  CHECK (monthly_budget_cents IS NULL OR monthly_budget_cents > 0);

COMMENT ON COLUMN users.monthly_budget_cents IS
  'Per-user cap mensual del LLM en centavos USD. NULL = usar env var global AI_MONTHLY_BUDGET_CENTS como default. CHECK garantiza positivos.';
