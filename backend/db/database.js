const { createClient } = require('@libsql/client');
const path = require('path');

const db = createClient({
  url: `file:${path.join(__dirname, '../maxcargo.db')}`,
});

async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'empleado',
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS servicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('fijo','variable','sueldo','impuesto','otro')),
      descripcion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT,
      telefono TEXT,
      pais TEXT,
      notas TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      dias_pago INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS facturas_proveedor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
      numero_factura TEXT,
      fecha TEXT NOT NULL,
      fecha_vencimiento TEXT,
      monto REAL NOT NULL DEFAULT 0,
      moneda TEXT NOT NULL DEFAULT 'ARS',
      concepto TEXT,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','ABONADA')),
      fecha_pago TEXT,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pagos_proveedor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
      factura_id INTEGER REFERENCES facturas_proveedor(id),
      fecha TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      moneda TEXT NOT NULL DEFAULT 'ARS',
      concepto TEXT,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mbk_clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mbk_origenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      precio_kg REAL NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mbk_envios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      numero INTEGER NOT NULL,
      origen_id INTEGER REFERENCES mbk_origenes(id),
      origen_nombre TEXT NOT NULL,
      vkg REAL NOT NULL DEFAULT 0,
      kg_real REAL NOT NULL DEFAULT 0,
      kg_fact REAL NOT NULL DEFAULT 0,
      kg_vta REAL NOT NULL DEFAULT 0,
      volumetrico REAL,
      costo_total REAL NOT NULL DEFAULT 0,
      venta REAL NOT NULL DEFAULT 0,
      ganancia REAL NOT NULL DEFAULT 0,
      cliente_id INTEGER REFERENCES mbk_clientes(id),
      monto_pagado REAL NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS manifiesto_pendientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      codigo_sh TEXT NOT NULL,
      peso REAL NOT NULL DEFAULT 0,
      usd REAL NOT NULL DEFAULT 0,
      precio_kg REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      prioridad TEXT NOT NULL DEFAULT 'media' CHECK(prioridad IN ('alta','media','baja')),
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','en progreso','resuelto')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mbk_pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES mbk_clientes(id),
      envio_id INTEGER REFERENCES mbk_envios(id),
      monto REAL NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL,
      concepto TEXT,
      tipo TEXT NOT NULL DEFAULT 'envio' CHECK(tipo IN ('envio','cuenta_corriente')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migraciones: agregar columnas nuevas si no existen
  try { await db.execute(`ALTER TABLE manifiesto_pendientes ADD COLUMN estado TEXT DEFAULT 'pendiente'`) } catch {}
  try { await db.execute(`ALTER TABLE manifiesto_pendientes ADD COLUMN cliente_id INTEGER REFERENCES mbk_clientes(id)`) } catch {}
  try { await db.execute(`ALTER TABLE mbk_clientes ADD COLUMN kg_vta REAL NOT NULL DEFAULT 0`) } catch {}
  try { await db.execute(`ALTER TABLE mbk_envios ADD COLUMN cliente_nombre TEXT`) } catch {}

  const existing = await db.execute(`SELECT id FROM usuarios WHERE email = 'admin@maxcargo.com'`);
  if (existing.rows.length === 0) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('admin123', 10);
    await db.execute({
      sql: `INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)`,
      args: ['Administrador', 'admin@maxcargo.com', hash, 'admin']
    });
    const hash2 = await bcrypt.hash('empleado123', 10);
    await db.execute({
      sql: `INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)`,
      args: ['Empleado Demo', 'empleado@maxcargo.com', hash2, 'empleado']
    });
    const servicios = [
      ['Luz', 'fijo'], ['Gas', 'fijo'], ['Telefonía / Internet', 'fijo'],
      ['Alquiler', 'fijo'], ['Sueldo Empleado', 'sueldo'], ['Contador', 'fijo'],
      ['Flete Local', 'variable'], ['Seguro', 'fijo'], ['Mantenimiento', 'variable'],
    ];
    for (const [nombre, tipo] of servicios) {
      await db.execute({ sql: `INSERT INTO servicios (nombre, tipo) VALUES (?, ?)`, args: [nombre, tipo] });
    }
    console.log('✓ Datos iniciales creados');
  }

  console.log('✓ Base de datos lista');
}

module.exports = { db, initDB };
