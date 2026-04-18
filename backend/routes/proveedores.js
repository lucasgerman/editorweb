const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const r = await db.execute(`
      SELECT p.*,
        COALESCE(SUM(CASE WHEN f.estado = 'PENDIENTE' AND f.moneda = 'ARS' THEN f.monto ELSE 0 END), 0)
          - COALESCE((SELECT SUM(pg.monto) FROM pagos_proveedor pg WHERE pg.proveedor_id = p.id AND pg.moneda = 'ARS' AND pg.factura_id IS NULL), 0)
          as deuda_ars,
        COALESCE(SUM(CASE WHEN f.estado = 'PENDIENTE' AND f.moneda = 'USD' THEN f.monto ELSE 0 END), 0)
          - COALESCE((SELECT SUM(pg.monto) FROM pagos_proveedor pg WHERE pg.proveedor_id = p.id AND pg.moneda = 'USD' AND pg.factura_id IS NULL), 0)
          as deuda_usd,
        COALESCE(SUM(f.monto), 0) as total_facturado,
        COUNT(CASE WHEN f.estado = 'PENDIENTE' THEN 1 END) as facturas_pendientes,
        COUNT(f.id) as total_facturas
      FROM proveedores p
      LEFT JOIN facturas_proveedor f ON f.proveedor_id = p.id
      WHERE p.activo = 1
      GROUP BY p.id
      ORDER BY (CASE WHEN deuda_ars = 0 AND deuda_usd = 0 THEN 1 ELSE 0 END), deuda_ars DESC, deuda_usd DESC, p.nombre
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await db.execute({ sql: 'SELECT * FROM proveedores WHERE id=?', args: [req.params.id] });
    if (!p.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    const facturas = await db.execute({
      sql: `SELECT * FROM facturas_proveedor WHERE proveedor_id = ? ORDER BY fecha DESC`,
      args: [req.params.id]
    });
    const pagos = await db.execute({
      sql: `SELECT pg.*, f.numero_factura
            FROM pagos_proveedor pg
            LEFT JOIN facturas_proveedor f ON f.id = pg.factura_id
            WHERE pg.proveedor_id = ?
            ORDER BY pg.fecha DESC`,
      args: [req.params.id]
    });
    res.json({ ...p.rows[0], facturas: facturas.rows, pagos: pagos.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, email, telefono, pais, notas, dias_pago } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const r = await db.execute({
      sql: 'INSERT INTO proveedores (nombre, email, telefono, pais, notas, dias_pago) VALUES (?,?,?,?,?,?) RETURNING *',
      args: [nombre, email || null, telefono || null, pais || null, notas || null, dias_pago || 0]
    });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, email, telefono, pais, notas, activo, dias_pago } = req.body;
    await db.execute({
      sql: 'UPDATE proveedores SET nombre=?, email=?, telefono=?, pais=?, notas=?, activo=?, dias_pago=? WHERE id=?',
      args: [nombre, email || null, telefono || null, pais || null, notas || null, activo ?? 1, dias_pago || 0, req.params.id]
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/facturas/all', async (req, res) => {
  try {
    const { proveedor_id, estado } = req.query;
    let where = '1=1';
    const args = [];
    if (proveedor_id) { where += ' AND f.proveedor_id=?'; args.push(proveedor_id); }
    if (estado) { where += ' AND f.estado=?'; args.push(estado); }

    const r = await db.execute({
      sql: `SELECT f.*, p.nombre as proveedor_nombre
            FROM facturas_proveedor f
            JOIN proveedores p ON p.id = f.proveedor_id
            WHERE ${where}
            ORDER BY f.fecha DESC`,
      args
    });
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/facturas', async (req, res) => {
  try {
    const { proveedor_id, numero_factura, fecha, fecha_vencimiento, monto, moneda, concepto, notas } = req.body;
    if (!proveedor_id || !fecha || !monto) return res.status(400).json({ error: 'proveedor_id, fecha, monto requeridos' });
    const r = await db.execute({
      sql: `INSERT INTO facturas_proveedor (proveedor_id, numero_factura, fecha, fecha_vencimiento, monto, moneda, concepto, notas)
            VALUES (?,?,?,?,?,?,?,?) RETURNING *`,
      args: [proveedor_id, numero_factura || null, fecha, fecha_vencimiento || null, Number(monto), moneda || 'ARS', concepto || null, notas || null]
    });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/facturas/:id', async (req, res) => {
  try {
    const { numero_factura, fecha, fecha_vencimiento, monto, moneda, concepto, estado, fecha_pago, notas } = req.body;
    await db.execute({
      sql: `UPDATE facturas_proveedor SET numero_factura=?, fecha=?, fecha_vencimiento=?, monto=?, moneda=?,
            concepto=?, estado=?, fecha_pago=?, notas=? WHERE id=?`,
      args: [numero_factura || null, fecha, fecha_vencimiento || null, Number(monto), moneda || 'ARS',
             concepto || null, estado || 'PENDIENTE', fecha_pago || null, notas || null, req.params.id]
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/facturas/:id', adminOnly, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM facturas_proveedor WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/pagos', async (req, res) => {
  try {
    const { proveedor_id, factura_id, fecha, monto, moneda, concepto, notas } = req.body;
    if (!proveedor_id || !fecha || !monto) return res.status(400).json({ error: 'proveedor_id, fecha, monto requeridos' });

    const r = await db.execute({
      sql: `INSERT INTO pagos_proveedor (proveedor_id, factura_id, fecha, monto, moneda, concepto, notas)
            VALUES (?,?,?,?,?,?,?) RETURNING *`,
      args: [proveedor_id, factura_id || null, fecha, Number(monto), moneda || 'ARS', concepto || null, notas || null]
    });

    if (factura_id) {
      await db.execute({
        sql: `UPDATE facturas_proveedor SET estado='ABONADA', fecha_pago=? WHERE id=?`,
        args: [fecha, factura_id]
      });
    }

    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/pagos/:id', adminOnly, async (req, res) => {
  try {
    const pago = await db.execute({ sql: 'SELECT * FROM pagos_proveedor WHERE id=?', args: [req.params.id] });
    if (!pago.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    if (pago.rows[0].factura_id) {
      await db.execute({
        sql: `UPDATE facturas_proveedor SET estado='PENDIENTE', fecha_pago=NULL WHERE id=?`,
        args: [pago.rows[0].factura_id]
      });
    }
    await db.execute({ sql: 'DELETE FROM pagos_proveedor WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
