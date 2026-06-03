// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettierConfig from 'eslint-config-prettier'

/**
 * N1: ESLint flat config para Trama.
 *
 * Cubre frontend (src/) y backend (netlify/functions/). Excluye dist/,
 * node_modules/, archivos generados y los worktrees de Claude que viven
 * en .claude/.
 *
 * Reglas: typescript-eslint recommended + React + react-hooks +
 * jsx-a11y (recommended, NO strict — strict tiene falsos positivos en
 * componentes que delegan a11y al wrapper).
 *
 * El config de Prettier (eslint-config-prettier) va último para que
 * desactive cualquier regla de estilo que pelearía con `prettier`.
 * Mantenemos las reglas semánticas de ESLint y delegamos formato a
 * Prettier.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.claude/**',
      '.netlify/**',
      '.husky/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      // El bundle-size script es un .mjs node-only — sin tipos React.
      'scripts/check-bundle-size.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'netlify/**/*.{ts,mts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Globals que usamos en runtime — evita "no-undef" en código
        // legítimo. Netlify expone `Netlify.env`; el bundler de Vite/
        // Netlify Functions provee fetch, URL, crypto, etc. globalmente.
        Netlify: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        ReadableStream: 'readonly',
        process: 'readonly',
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLDialogElement: 'readonly',
        SVGSVGElement: 'readonly',
        SVGElement: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        React: 'readonly',
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: '18.3' },
    },
    rules: {
      // React: las reglas críticas. No imponemos PropTypes (usamos TS).
      'react/jsx-uses-react': 'off', // React 18 no necesita import React
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-vars': 'error',
      'react/no-unknown-property': 'error',
      'react/jsx-key': 'error',

      // React Hooks: el rule of hooks + deps de useEffect. Ya tenemos
      // varios `// eslint-disable-next-line react-hooks/exhaustive-deps`
      // intencionales en el código — la regla los respeta.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // jsx-a11y: lo que axe-core captura en runtime + reglas de
      // sintaxis. Mantenemos en `warn` para no bloquear desarrollo,
      // pero CI puede correr con --max-warnings 0 si se quiere strict.
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/click-events-have-key-events': 'off', // demasiados FP en componentes de grafo con drag
      'jsx-a11y/no-static-element-interactions': 'off', // idem

      // TypeScript: lo que recommended ya trae es razonable. Customizamos:
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // El codebase está en cero `any`: lo hacemos `error` para que el gate de
      // CI lo mantenga así (antes era `warn` y dependía de disciplina). Tests y
      // e2e tienen override a `off` para sus casts pragmáticos de mocks.
      '@typescript-eslint/no-explicit-any': 'error',
      // Cero usos del tipo `Function` en el codebase: lo subimos a error junto
      // con no-explicit-any para que el gate mantenga la tipificación fuerte.
      '@typescript-eslint/no-unsafe-function-type': 'error',
      // El patrón `let x; try { x = ... } catch {...}` es legítimo
      // (especialmente cuando el catch DEVUELVE una Response). La regla
      // de no-useless-assignment es demasiado estricta — generaba 6+
      // falsos positivos. Desactivada.
      '@typescript-eslint/no-useless-assignment': 'off',
      'no-useless-assignment': 'off',
      // El project usa un patrón consistente de empty interface vacío
      // para extender props — desactivamos la regla quisquillosa.
      '@typescript-eslint/no-empty-object-type': 'off',

      // No-console: warn excepto en .mts del backend donde logEvent
      // delega a console.log/error a propósito.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // No usamos `var`. Y `let` solo cuando hace falta reasignación.
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },
  // Backend: relajamos no-console porque observability.ts delega a
  // console.log/error a propósito.
  {
    files: ['netlify/**/*.{ts,mts}'],
    rules: {
      'no-console': 'off',
    },
  },
  // Node scripts: CLI output and process exit codes are their public API.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  // Tests: relajamos no-explicit-any y unused-vars (los tests a menudo
  // tienen casts pragmáticos para los mocks).
  {
    files: ['**/*.test.{ts,tsx}', '**/test-utils.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // E2E: jsx-a11y no aplica a especificaciones de Playwright.
  {
    files: ['e2e/**/*.{ts,tsx}'],
    plugins: {},
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Prettier al final — desactiva las rules que peleen con prettier.
  prettierConfig,
)
