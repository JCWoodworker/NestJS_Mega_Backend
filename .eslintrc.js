module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'import'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
    },
  },
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'import/order': [
      'error',
      {
        groups: [
          ['builtin', 'external'],
          'internal',
          ['parent', 'sibling', 'index'],
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
        pathGroups: [
          {
            pattern: '@app/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@users/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@config/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@iam/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@gemini/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@subapps/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@onlybizlinks/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@mycuttingboard/**',
            group: 'internal',
            position: 'before',
          },
          {
            pattern: '@utils/**',
            group: 'internal',
            position: 'before',
          },
        ],
      },
    ],
  },
};
