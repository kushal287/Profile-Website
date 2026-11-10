'use strict';
// Entry point used by `npm start`: restores saved data first (when GitHub storage is configured), then starts the site.
try { process.loadEnvFile(); } catch { /* no .env file, real environment variables are used */ }
const persist = require('./persist');

persist.restore()
  .then((restored) => {
    if (restored) console.log('[persist] data restored from GitHub');
    require('./server');
  })
  .catch((e) => {
    // Refuse to start rather than run empty and overwrite the saved copy later.
    console.error('[persist] could not restore saved data, not starting:', e.message);
    process.exit(1);
  });
