// Tests de reglas: corren en Node contra los emuladores (npm run test:rules), sin el preset de Expo.
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  // Sin <rootDir> en el patrón: en Windows queda con "\" y no encuentra nada si la ruta tiene una carpeta con punto (.claude/worktrees).
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: ['@babel/preset-typescript'],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  testTimeout: 30000,
};
