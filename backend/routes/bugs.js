const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM bugs ORDER BY CASE prioridad WHEN \'alta\' THEN 1 WHEN \'media\' THEN 2 ELSE 3 END, created_at DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { titulo, descripcion, prioridad } = req.body;
    if (!titulo) return res.status(400).json({ error: 'titulo requerido' });
    const r = await db.execute({
      sql: 'INSERT INTO bugs (titulo, descripcion, prioridad) VALUES (?,?,?) RETURNING *',
      args: [titulo, descripcion || null, prioridad || 'media']
    });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { titulo, descripcion, prioridad, estado } = req.body;
    await db.execute({
      sql: 'UPDATE bugs SET titulo=?, descripcion=?, prioridad=?, estado=? WHERE id=?',
      args: [titulo, descripcion || null, prioridad, estado, req.params.id]
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM bugs WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
