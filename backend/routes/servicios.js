const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM servicios ORDER BY tipo, nombre');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const { nombre, tipo, descripcion } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: 'nombre y tipo requeridos' });
    const r = await db.execute({ sql: 'INSERT INTO servicios (nombre, tipo, descripcion) VALUES (?,?,?) RETURNING *', args: [nombre, tipo, descripcion || null] });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { nombre, tipo, descripcion, activo } = req.body;
    await db.execute({ sql: 'UPDATE servicios SET nombre=?, tipo=?, descripcion=?, activo=? WHERE id=?', args: [nombre, tipo, descripcion || null, activo ?? 1, req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE servicios SET activo=0 WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
