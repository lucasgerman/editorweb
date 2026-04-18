const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'maxcargo.db');
const db = new Database(dbPath);

console.log('Borrando mbk_pagos (dependientes)...');
const result0 = db.prepare('DELETE FROM mbk_pagos').run();
console.log(`  ✓ ${result0.changes} registros borrados`);

console.log('Borrando datos de mbk_envios...');
const result1 = db.prepare('DELETE FROM mbk_envios').run();
console.log(`  ✓ ${result1.changes} registros borrados`);

console.log('Borrando datos de manifiesto_pendientes...');
const result2 = db.prepare('DELETE FROM manifiesto_pendientes').run();
console.log(`  ✓ ${result2.changes} registros borrados`);

db.close();
console.log('✓ Listo!');