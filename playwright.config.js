// Pruebas de humo: abren la app real en un navegador, con una base de datos simulada
// (nunca tocan los datos reales). Correr con: npm test
const { defineConfig } = require('@playwright/test');
const exe = process.env.PW_CHROMIUM || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30000,
  retries: 0,
  use: { baseURL: 'http://localhost:8766/', viewport: { width: 1300, height: 900 }, launchOptions: exe ? { executablePath: exe } : {} },
  webServer: { command: 'python3 -m http.server 8766', port: 8766, reuseExistingServer: true },
});
