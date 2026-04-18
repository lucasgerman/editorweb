const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', adminOnly, async (req, res) => {
  try {
    const r = await db.execute('SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY id');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos requeridos: nombre, email, password' });
    const hash = await bcrypt.hash(password, 10);
    const r = await db.execute({
      sql: 'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?,?,?,?) RETURNING id, nombre, email, rol',
      args: [nombre, email, hash, rol || 'empleado']
    });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { nombre, email, rol, activo, password } = req.body;
    const { id } = req.params;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.execute({ sql: 'UPDATE usuarios SET nombre=?, email=?, rol=?, activo=?, password=? WHERE id=?', args: [nombre, email, rol, activo, hash, id] });
    } else {
      await db.execute({ sql: 'UPDATE usuarios SET nombre=?, email=?, rol=?, activo=? WHERE id=?', args: [nombre, email, rol, activo, id] });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE usuarios SET activo=0 WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
