const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `pnpm qa:ui` arma la versión web con DUEL_QA=1: config/firebase.ts se cambia por el de los
// emuladores. Cualquier otro build (Expo Go, tiendas) usa la configuración de siempre.
if (process.env.DUEL_QA === '1') {
  const real = path.join(__dirname, 'config', 'firebase.ts');
  const qa = path.join(__dirname, 'scripts', 'qa', 'firebase.ts');
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resuelto = context.resolveRequest(context, moduleName, platform);
    if (resuelto.type === 'sourceFile' && path.resolve(resuelto.filePath) === real) {
      return { type: 'sourceFile', filePath: qa };
    }
    return resuelto;
  };
}

module.exports = config;
