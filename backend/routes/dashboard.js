const router = require('express').Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { anio, mes } = req.query;
    let where = 'WHERE 1=1';
    const args = [];
    if (anio) { where += ' AND strftime(\'%Y\', fecha) = ?'; args.push(String(anio)); }
    if (mes) { where += ' AND strftime(\'%m\', fecha) = ?'; args.push(String(mes).padStart(2, '0')); }

    const [envios, porMes, porOrigen, deuda, bugs] = await Promise.all([
      db.execute({
        sql: `SELECT
          COUNT(*) as total_envios,
          COALESCE(SUM(kg_real), 0) as total_kg_real,
          COALESCE(SUM(kg_fact), 0) as total_kg_fact,
          COALESCE(SUM(costo_total), 0) as total_costo,
          COALESCE(SUM(venta), 0) as total_venta,
          COALESCE(SUM(ganancia), 0) as total_ganancia,
          COALESCE(SUM(monto_pagado), 0) as total_cobrado
          FROM mbk_envios ${where}`,
        args
      }),
      db.execute({
        sql: `SELECT
          strftime('%m', fecha) as mes_num,
          COALESCE(SUM(ganancia), 0) as ganancia,
          COALESCE(SUM(venta), 0) as venta,
          COALESCE(SUM(costo_total), 0) as costo,
          COUNT(*) as envios
          FROM mbk_envios
          WHERE strftime('%Y', fecha) = ?
          GROUP BY mes_num ORDER BY mes_num`,
        args: [String(anio || new Date().getFullYear())]
      }),
      db.execute({
        sql: `SELECT origen_nombre,
          COUNT(*) as total,
          COALESCE(SUM(ganancia), 0) as ganancia,
          COALESCE(SUM(venta), 0) as venta
          FROM mbk_envios ${where}
          GROUP BY origen_nombre ORDER BY ganancia DESC LIMIT 8`,
        args
      }),
      db.execute(`SELECT COALESCE(SUM(monto), 0) as total FROM mbk_deuda_maxi`),
      db.execute(`SELECT COUNT(*) as total FROM bugs WHERE estado != 'resuelto'`),
    ]);

    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const porMesData = Array.from({ length: 12 }, (_, i) => {
      const num = String(i + 1).padStart(2, '0');
      const found = porMes.rows.find(r => r.mes_num === num);
      return { mes: MESES[i], num: i + 1, ganancia: found?.ganancia || 0, venta: found?.venta || 0, costo: found?.costo || 0, envios: found?.envios || 0 };
    });

    res.json({
      kpis: envios.rows[0],
      porMes: porMesData,
      porOrigen: porOrigen.rows,
      deuda_maxi: deuda.rows[0]?.total || 0,
      bugs_pendientes: bugs.rows[0]?.total || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
