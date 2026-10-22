import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('==================================================');
console.log('  Starting GadgetVerse Platform...');
console.log('==================================================');

// 1. Start Backend on Port 3000
const backend = spawn('node', ['backend/server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env, PORT: '3000' }
});

// 2. Start Frontend on Port 5000
const frontend = spawn('node', ['frontend/server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env, PORT: '5000', BACKEND_URL: 'http://127.0.0.1:3000' }
});

function shutdown() {
  console.log('\nStopping GadgetVerse services...');
  backend.kill();
  frontend.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
