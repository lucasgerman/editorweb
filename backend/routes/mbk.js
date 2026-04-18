const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.use(authMiddleware);

// ── CLIENTES ──────────────────────────────────────────────

router.get('/clientes', async (req, res) => {
  try {
    const r = await db.execute(`
      SELECT c.*,
        COUNT(e.id) as total_envios,
        COALESCE(SUM(e.kg_real), 0) as total_kg,
        COALESCE(SUM(e.venta), 0) as total_venta,
        COALESCE(SUM(e.monto_pagado), 0) as total_pagado
      FROM mbk_clientes c
      LEFT JOIN mbk_envios e ON e.cliente_id = c.id
      GROUP BY c.id
      ORDER BY c.nombre
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/clientes/:id/envios', async (req, res) => {
  try {
    const r = await db.execute({
      sql: 'SELECT * FROM mbk_envios WHERE cliente_id=? ORDER BY numero DESC',
      args: [req.params.id]
    });
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/clientes', async (req, res) => {
  try {
    const { nombre, kg_vta } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const r = await db.execute({
      sql: 'INSERT INTO mbk_clientes (nombre, kg_vta) VALUES (?, ?) RETURNING *',
      args: [nombre.trim(), parseFloat(kg_vta) || 0]
    });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/clientes/:id', async (req, res) => {
  try {
    const { nombre, kg_vta } = req.body;
    await db.execute({ sql: 'UPDATE mbk_clientes SET nombre=?, kg_vta=? WHERE id=?', args: [nombre.trim(), parseFloat(kg_vta) || 0, req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/clientes/:id', adminOnly, async (req, res) => {
  try {
    // Preserve envíos: snapshot nombre and null out cliente_id
    const cliR = await db.execute({ sql: 'SELECT nombre FROM mbk_clientes WHERE id=?', args: [req.params.id] });
    if (cliR.rows[0]) {
      await db.execute({
        sql: `UPDATE mbk_envios SET cliente_id = NULL, cliente_nombre = ? WHERE cliente_id = ? AND (cliente_nombre IS NULL OR cliente_nombre = '')`,
        args: [cliR.rows[0].nombre, req.params.id]
      });
      await db.execute({ sql: `UPDATE mbk_envios SET cliente_id = NULL WHERE cliente_id = ?`, args: [req.params.id] });
    }
    await db.execute({ sql: 'DELETE FROM mbk_clientes WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ORÍGENES ──────────────────────────────────────────────

router.get('/origenes', async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM mbk_origenes ORDER BY nombre');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/origenes', async (req, res) => {
  try {
    const { nombre, precio_kg } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const r = await db.execute({
      sql: 'INSERT INTO mbk_origenes (nombre, precio_kg) VALUES (?, ?) RETURNING *',
      args: [nombre.trim(), precio_kg || 0]
    });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un origen con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/origenes/:id', async (req, res) => {
  try {
    const { nombre, precio_kg, activo } = req.body;
    await db.execute({
      sql: 'UPDATE mbk_origenes SET nombre=?, precio_kg=?, activo=? WHERE id=?',
      args: [nombre.trim(), precio_kg || 0, activo ?? 1, req.params.id]
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un origen con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/origenes/:id', adminOnly, async (req, res) => {
  try {
    const used = await db.execute({ sql: 'SELECT COUNT(*) as c FROM mbk_envios WHERE origen_id=?', args: [req.params.id] });
    if (used.rows[0].c > 0) return res.status(409).json({ error: 'No se puede eliminar: hay envíos con este origen' });
    await db.execute({ sql: 'DELETE FROM mbk_origenes WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ENVÍOS ────────────────────────────────────────────────

router.post('/envios/bulk', async (req, res) => {
  const rows = req.body
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Sin filas' })

  const ok = [], errors = []

  // Traer origenes y clientes una sola vez
  const origenesR = await db.execute('SELECT * FROM mbk_origenes')
  const origenes = origenesR.rows
  const clientesR = await db.execute('SELECT * FROM mbk_clientes')
  const clienteMap = {}
  clientesR.rows.forEach(c => { clienteMap[c.nombre.toLowerCase().trim()] = c })

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i]
    try {
      // Resolver origen — si es "Pendiente" o no existe, usar/crear "Pendiente"
      let origen = origenes.find(o => o.nombre.toLowerCase().trim() === (f.origen_nombre || '').toLowerCase().trim())
      if (!origen) {
        let pendiente = origenes.find(o => o.nombre.toLowerCase() === 'pendiente')
        if (!pendiente) {
          const r = await db.execute({ sql: 'INSERT INTO mbk_origenes (nombre, precio_kg) VALUES (?,?) RETURNING *', args: ['Pendiente', 0] })
          pendiente = r.rows[0]
          origenes.push(pendiente)
        }
        origen = pendiente
      }

      // Resolver cliente — el frontend ya resolvió el cliente_id
      let cliente_id = f.cliente_id || null

      // Usar código provisto o auto-generar
      let codigo, numero
      if (f.codigo && f.codigo.trim()) {
        codigo = f.codigo.trim().toUpperCase()
        numero = parseInt(codigo.replace(/^MBK/i, ''), 10) || 0
      } else {
        const maxR = await db.execute('SELECT MAX(numero) as m FROM mbk_envios')
        numero = (maxR.rows[0].m || 0) + 1
        codigo = 'MBK' + String(numero).padStart(5, '0')
      }

      const vkg = f.vkg != null && f.vkg !== '' ? parseFloat(f.vkg) : origen.precio_kg
      const kg_real = parseFloat(f.kg_real) || 0
      const kg_fact = parseFloat(f.kg_fact) || 0
      const kg_vta = parseFloat(f.kg_vta) || 0
      const volumetrico = f.volumetrico != null && f.volumetrico !== '' ? parseFloat(f.volumetrico) : null
      const monto_pagado = parseFloat(f.monto_pagado) || 0
      const costo_total = parseFloat((kg_real * vkg).toFixed(2))
      const venta = parseFloat((kg_fact * kg_vta).toFixed(2))
      const ganancia = parseFloat((venta - costo_total).toFixed(2))

      await db.execute({
        sql: `INSERT INTO mbk_envios (codigo, numero, origen_id, origen_nombre, vkg, kg_real, kg_fact, kg_vta, volumetrico, costo_total, venta, ganancia, cliente_id, monto_pagado, fecha, notas)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [codigo, numero, origen.id, origen.nombre, vkg, kg_real, kg_fact, kg_vta, volumetrico, costo_total, venta, ganancia, cliente_id, monto_pagado, f.fecha, f.notas || null]
      })
      ok.push(codigo)
    } catch (e) {
      errors.push({ fila: i + 1, error: e.message })
    }
  }

  res.json({ importados: ok.length, errores: errors.length, ok, errors })
})

router.get('/envios', async (req, res) => {
  try {
    const { q, origen_id } = req.query;
    let where = '1=1';
    const args = [];
    if (q) { where += ' AND (e.codigo LIKE ? OR e.origen_nombre LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
    if (origen_id) { where += ' AND e.origen_id=?'; args.push(origen_id); }

    const r = await db.execute({
      sql: `SELECT e.* FROM mbk_envios e WHERE ${where} ORDER BY e.numero DESC`,
      args
    });
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/envios', async (req, res) => {
  try {
    const f = req.body;
    if (!f.origen_id || !f.fecha) return res.status(400).json({ error: 'origen_id y fecha requeridos' });

    // Snapshot del precio_kg del origen
    const origenR = await db.execute({ sql: 'SELECT * FROM mbk_origenes WHERE id=?', args: [f.origen_id] });
    if (!origenR.rows[0]) return res.status(404).json({ error: 'Origen no encontrado' });
    const origen = origenR.rows[0];

    // Número siguiente
    const maxR = await db.execute('SELECT MAX(numero) as m FROM mbk_envios');
    const numero = (maxR.rows[0].m || 0) + 1;
    const codigo = 'MBK' + String(numero).padStart(5, '0');

    const vkg = origen.precio_kg;
    const kg_real = f.kg_real || 0;
    const kg_fact = f.kg_fact || 0;
    // Use client's kg_vta if not explicitly provided
    let kg_vta = f.kg_vta != null && f.kg_vta !== '' ? parseFloat(f.kg_vta) : 0;
    if (!kg_vta && f.cliente_id) {
      const cliR = await db.execute({ sql: 'SELECT kg_vta FROM mbk_clientes WHERE id=?', args: [f.cliente_id] });
      kg_vta = parseFloat(cliR.rows[0]?.kg_vta) || 0;
    }
    const costo_total = parseFloat((kg_real * vkg).toFixed(2));
    const venta = f.venta != null ? parseFloat(f.venta) : parseFloat((kg_fact * kg_vta).toFixed(2));
    const ganancia = parseFloat((venta - costo_total).toFixed(2));
    // Snapshot client name
    let cliente_nombre = null;
    if (f.cliente_id) {
      const cn = await db.execute({ sql: 'SELECT nombre FROM mbk_clientes WHERE id=?', args: [f.cliente_id] });
      cliente_nombre = cn.rows[0]?.nombre || null;
    }

    const r = await db.execute({
      sql: `INSERT INTO mbk_envios (codigo, numero, origen_id, origen_nombre, vkg, kg_real, kg_fact, kg_vta, volumetrico, costo_total, venta, ganancia, cliente_id, cliente_nombre, monto_pagado, fecha, notas)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
      args: [codigo, numero, origen.id, origen.nombre, vkg, kg_real, kg_fact, kg_vta, f.volumetrico ?? null, costo_total, venta, ganancia, f.cliente_id || null, cliente_nombre, f.monto_pagado || 0, f.fecha, f.notas || null]
    });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/envios/:id', async (req, res) => {
  try {
    const f = req.body;
    const vkg = f.vkg || 0;
    const kg_real = f.kg_real || 0;
    const kg_fact = f.kg_fact || 0;
    const kg_vta = f.kg_vta || 0;
    const costo_total = f.costo_total != null ? parseFloat(f.costo_total) : parseFloat((kg_real * vkg).toFixed(2));
    const venta = f.venta != null ? parseFloat(f.venta) : parseFloat((kg_fact * kg_vta).toFixed(2));
    const ganancia = parseFloat((venta - costo_total).toFixed(2));
    let cliente_nombre = f.cliente_nombre || null;
    if (f.cliente_id && !cliente_nombre) {
      const cn = await db.execute({ sql: 'SELECT nombre FROM mbk_clientes WHERE id=?', args: [f.cliente_id] });
      cliente_nombre = cn.rows[0]?.nombre || null;
    }

    await db.execute({
      sql: `UPDATE mbk_envios SET origen_id=?, origen_nombre=?, vkg=?, kg_real=?, kg_fact=?, kg_vta=?, volumetrico=?, costo_total=?, venta=?, ganancia=?, cliente_id=?, cliente_nombre=?, monto_pagado=?, fecha=?, notas=? WHERE id=?`,
      args: [f.origen_id, f.origen_nombre, vkg, kg_real, kg_fact, kg_vta, f.volumetrico ?? null, costo_total, venta, ganancia, f.cliente_id || null, cliente_nombre, f.monto_pagado || 0, f.fecha, f.notas || null, req.params.id]
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/envios/:id', adminOnly, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM mbk_envios WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
