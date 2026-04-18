const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const saldoSubquery = `COALESCE((SELECT SUM(p2.monto) FROM mbk_pagos p2 WHERE p2.cliente_id = c.id AND p2.tipo = 'cuenta_corriente'), 0)`;

router.get('/clientes', async (req, res) => {
  try {
    const r = await db.execute(`
      SELECT c.*,
        COALESCE(SUM(e.venta), 0)        AS total_facturado,
        COALESCE(SUM(e.monto_pagado), 0) AS total_pagado_envios,
        COALESCE(SUM(e.kg_real), 0)      AS total_kg,
        ${saldoSubquery}                 AS total_cc,
        COALESCE(SUM(e.venta), 0) - COALESCE(SUM(e.monto_pagado), 0) - ${saldoSubquery} AS saldo
      FROM mbk_clientes c
      LEFT JOIN mbk_envios e ON e.cliente_id = c.id
      GROUP BY c.id
      ORDER BY saldo DESC, c.nombre
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/clientes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [cliR, envR, pagR] = await Promise.all([
      db.execute({
        sql: `SELECT c.*,
          COALESCE(SUM(e.venta), 0)        AS total_facturado,
          COALESCE(SUM(e.monto_pagado), 0) AS total_pagado_envios,
          ${saldoSubquery}                 AS total_cc,
          COALESCE(SUM(e.venta), 0) - COALESCE(SUM(e.monto_pagado), 0) - ${saldoSubquery} AS saldo
          FROM mbk_clientes c
          LEFT JOIN mbk_envios e ON e.cliente_id = c.id
          WHERE c.id = ?
          GROUP BY c.id`,
        args: [id]
      }),
      db.execute({
        sql: `SELECT *, (venta - monto_pagado) AS saldo_envio FROM mbk_envios WHERE cliente_id = ? ORDER BY numero DESC`,
        args: [id]
      }),
      db.execute({
        sql: `SELECT p.*, e.codigo AS envio_codigo
              FROM mbk_pagos p
              LEFT JOIN mbk_envios e ON e.id = p.envio_id
              WHERE p.cliente_id = ?
              ORDER BY p.fecha DESC, p.created_at DESC`,
        args: [id]
      })
    ]);
    if (!cliR.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ cliente: cliR.rows[0], envios: envR.rows, pagos: pagR.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/pago', async (req, res) => {
  try {
    const { cliente_id, envio_id, monto, fecha, concepto } = req.body;
    if (!cliente_id || !monto || !fecha) return res.status(400).json({ error: 'Faltan campos requeridos' });
    const tipo = envio_id ? 'envio' : 'cuenta_corriente';
    const montoF = parseFloat(monto);

    const r = await db.execute({
      sql: `INSERT INTO mbk_pagos (cliente_id, envio_id, monto, fecha, concepto, tipo) VALUES (?,?,?,?,?,?) RETURNING *`,
      args: [cliente_id, envio_id || null, montoF, fecha, concepto || null, tipo]
    });

    if (envio_id) {
      await db.execute({
        sql: `UPDATE mbk_envios SET monto_pagado = monto_pagado + ? WHERE id = ?`,
        args: [montoF, envio_id]
      });
    }

    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/pago/:id', async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT * FROM mbk_pagos WHERE id=?', args: [req.params.id] });
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    const pago = r.rows[0];

    if (pago.envio_id) {
      await db.execute({
        sql: `UPDATE mbk_envios SET monto_pagado = MAX(0, monto_pagado - ?) WHERE id = ?`,
        args: [pago.monto, pago.envio_id]
      });
    }

    await db.execute({ sql: 'DELETE FROM mbk_pagos WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Nuevo cobro: distribuye pagos entre envíos seleccionados + CC para el resto
router.post('/nuevo-cobro', async (req, res) => {
  try {
    const { cliente_id, fecha, concepto, distribuciones } = req.body;
    // distribuciones: [{ envio_id, monto }] — pueden ser parciales o totales
    if (!cliente_id || !fecha || !Array.isArray(distribuciones) || distribuciones.length === 0)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    for (const d of distribuciones) {
      const monto = parseFloat(d.monto) || 0;
      if (monto <= 0) continue;
      const tipo = d.envio_id ? 'envio' : 'cuenta_corriente';
      await db.execute({
        sql: `INSERT INTO mbk_pagos (cliente_id, envio_id, monto, fecha, concepto, tipo) VALUES (?,?,?,?,?,?)`,
        args: [cliente_id, d.envio_id || null, monto, fecha, concepto || null, tipo]
      });
      if (d.envio_id) {
        await db.execute({
          sql: `UPDATE mbk_envios SET monto_pagado = monto_pagado + ? WHERE id = ?`,
          args: [monto, d.envio_id]
        });
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
