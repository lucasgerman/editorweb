const router = require('express').Router();
const multer = require('multer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ── PARSERS ──────────────────────────────────────────────────

function parseSpanishNum(s) {
  if (!s) return null;
  let str = String(s).trim();
  str = str.replace(/^u\$?s\s*/i, '').replace(/\s*kg$/i, '');
  str = str.replace(/[^\d,.-]/g, '');
  if (!str) return null;

  const hasComma = str.includes(',');
  const hasDot   = str.includes('.');
  if (hasComma && hasDot) {
    if (str.lastIndexOf('.') > str.lastIndexOf(',')) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    str = str.replace(',', '.');
  }

  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function esTexto(s) {
  return /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(s);
}

function esSH(s) {
  return /^\d{5,7}$/.test(s.trim());
}

function parsearLinea(linea) {
  let tokens = linea.split(/\t|\s{2,}/).map(t => t.trim()).filter(Boolean);
  if (tokens.length < 3) {
    tokens = linea.split(/\s+/).map(t => t.trim()).filter(Boolean);
  }
  if (tokens.length < 3) return null;

  const shIdx = tokens.findIndex(t => esSH(t));
  if (shIdx === -1) return null;

  const codigo_sh = tokens[shIdx];

  const beforeSH = tokens.slice(0, shIdx);
  const clienteParts = [];
  for (const t of beforeSH) {
    if (esTexto(t)) {
      const clean = t
        .replace(/^[^a-zA-ZáéíóúÁÉÍÓÚñÑ]+/, '')
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]+$/, '');
      if (clean.length >= 4) clienteParts.push(clean.toUpperCase());
    }
  }
  const cliente = clienteParts.join(' ');

  const afterSH = tokens.slice(shIdx + 1);
  const nums = [];
  for (const t of afterSH) {
    const n = parseSpanishNum(t);
    if (n !== null && n > 0) nums.push(n);
  }

  if (nums.length < 2) return null;

  const peso = nums[0];
  const usd  = nums[nums.length - 1];
  if (!peso || !usd || peso === usd) return null;

  return {
    cliente,
    codigo_sh,
    peso,
    usd,
    precio_kg: parseFloat((usd / peso).toFixed(4))
  };
}

function parsearTextoOCR(texto) {
  const lineas = texto.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 5 && /\d/.test(l));

  const filas = [];
  for (const linea of lineas) {
    if (/columna|total|header/i.test(linea)) continue;
    const fila = parsearLinea(linea);
    if (fila) filas.push(fila);
  }
  return filas;
}

// ── OCR COMPARTIDO ───────────────────────────────────────────

async function analizarImagen(file) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const base64 = file.buffer.toString('base64');
    const mimeType = file.mimetype || 'image/jpeg';

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: `Analizá esta imagen de una planilla/manifiesto de envíos.
Extraé cada fila con estos 4 campos: Cliente, Código SH (número de 5-7 dígitos), Peso (kg), u$s (dólares).
Ignorá encabezados, filas vacías y la fila de total.
Devolvé ÚNICAMENTE un array JSON válido, sin texto adicional ni markdown.
Ejemplo: [{"cliente":"MAXI","codigo_sh":"163538","peso":3.2,"usd":176}]` }
        ]
      }]
    });

    const texto = message.content[0].text.trim();
    const match = texto.match(/\[[\s\S]*\]/);
    const rows = JSON.parse(match ? match[0] : texto);
    return rows
      .filter(r => r && (r.cliente || r.codigo_sh))
      .map(r => ({
        cliente: r.cliente || '',
        codigo_sh: String(r.codigo_sh || ''),
        peso: parseFloat(r.peso) || 0,
        usd: parseFloat(r.usd) || 0,
        precio_kg: r.peso && r.usd ? parseFloat((r.usd / r.peso).toFixed(4)) : 0
      }));
  }

  const processedBuffer = await sharp(file.buffer)
    .grayscale()
    .normalise()
    .sharpen()
    .resize({ width: file.buffer.length > 500000 ? undefined : 2000, withoutEnlargement: false })
    .toBuffer();

  const { data: { text } } = await Tesseract.recognize(processedBuffer, 'spa+eng', {
    logger: () => {},
    tessedit_pageseg_mode: '6',
    tessedit_ocr_engine_mode: '1',
    preserve_interword_spaces: '1',
  });

  return parsearTextoOCR(text);
}

// ── RUTAS ────────────────────────────────────────────────────

router.post('/analizar', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Se requiere una imagen' });
    const filas = await analizarImagen(req.file);
    if (filas.length === 0) {
      return res.status(422).json({ error: 'No se detectaron filas. Revisá que la imagen tenga buen contraste y texto legible.' });
    }
    res.json(filas);
  } catch (e) {
    console.error('[manifiesto/analizar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Compara imagen contra manifiesto_pendientes
router.post('/cotejar', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Se requiere una imagen' });

    const filasDetectadas = await analizarImagen(req.file);
    if (filasDetectadas.length === 0) {
      return res.status(422).json({ error: 'No se detectaron envíos en la imagen.' });
    }

    const r = await db.execute('SELECT * FROM manifiesto_pendientes ORDER BY created_at DESC');
    const pendientes = r.rows;

    const pendientesBySH = {};
    pendientes.forEach(p => { pendientesBySH[p.codigo_sh] = p; });

    const shDetectados = new Set();
    const encontrados = [];
    const noEncontrados = [];

    for (const det of filasDetectadas) {
      shDetectados.add(det.codigo_sh);
      const pend = pendientesBySH[det.codigo_sh];
      if (pend) {
        const diferencias = [];
        if (Math.abs(pend.peso - det.peso) > 0.1) {
          diferencias.push({ campo: 'peso', manifiesto: pend.peso, imagen: det.peso });
        }
        if (Math.abs(pend.precio_kg - det.precio_kg) > 0.5) {
          diferencias.push({ campo: 'precio_kg', manifiesto: pend.precio_kg, imagen: det.precio_kg });
        }
        encontrados.push({ pendiente: pend, detectado: det, diferencias });
      } else {
        noEncontrados.push(det);
      }
    }

    const sinDetectar = pendientes.filter(p => !shDetectados.has(p.codigo_sh));

    res.json({ encontrados, noEncontrados, sinDetectar });
  } catch (e) {
    console.error('[manifiesto/cotejar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Mueve pendientes confirmados a mbk_envios (acepta edits opcionales por ID)
router.post('/confirmar', async (req, res) => {
  try {
    const { ids, edits = {} } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Sin IDs' });

    const hoy = new Date().toISOString().slice(0, 10);
    let confirmados = 0;

    for (const id of ids) {
      const r = await db.execute({ sql: 'SELECT * FROM manifiesto_pendientes WHERE id=?', args: [id] });
      if (r.rows.length === 0) continue;
      const p = r.rows[0];
      const ov = edits[id] || edits[String(id)] || {};

      const cliente   = ov.cliente   !== undefined ? ov.cliente   : (p.cliente || null);
      const cliente_id = ov.cliente_id !== undefined ? ov.cliente_id : (p.cliente_id || null);
      const peso      = ov.peso      !== undefined ? parseFloat(ov.peso) : parseFloat(p.peso);
      const usd       = ov.usd       !== undefined ? parseFloat(ov.usd)  : parseFloat(p.usd);
      const precio_kg = peso && usd ? parseFloat((usd / peso).toFixed(4)) : parseFloat(p.precio_kg);

      const codigo = p.codigo_sh;
      const numero = parseInt(codigo) || 0;

      try {
        await db.execute({
          sql: `INSERT OR IGNORE INTO mbk_envios
            (codigo, numero, origen_id, origen_nombre, vkg, kg_real, kg_fact, kg_vta,
             volumetrico, costo_total, venta, ganancia, cliente_id, monto_pagado, fecha, notas)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            codigo, numero, null, 'SH Manifiesto',
            precio_kg, peso, peso, 60,
            null, usd, parseFloat((peso * 60).toFixed(2)), parseFloat((peso * 60 - usd).toFixed(2)),
            cliente_id, 0, hoy, cliente
          ]
        });
        await db.execute({ sql: 'DELETE FROM manifiesto_pendientes WHERE id=?', args: [id] });
        confirmados++;
      } catch (insertErr) {
        console.error(`[confirmar] ID ${id}:`, insertErr.message);
      }
    }

    res.json({ confirmados });
  } catch (e) {
    console.error('[manifiesto/confirmar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/pendientes', async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM manifiesto_pendientes ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/pendientes/:id', async (req, res) => {
  try {
    const { cliente, cliente_id, codigo_sh, peso, usd } = req.body;
    const precio_kg = peso && usd ? parseFloat((usd / peso).toFixed(4)) : 0;
    await db.execute({
      sql: `UPDATE manifiesto_pendientes SET cliente=?, cliente_id=?, codigo_sh=?, peso=?, usd=?, precio_kg=? WHERE id=?`,
      args: [cliente || '', cliente_id || null, codigo_sh || '', parseFloat(peso) || 0, parseFloat(usd) || 0, precio_kg, req.params.id]
    });
    const r = await db.execute({ sql: 'SELECT * FROM manifiesto_pendientes WHERE id=?', args: [req.params.id] });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/pendientes/:id/estado', async (req, res) => {
  try {
    const { estado, origen_id, origen_nombre } = req.body;
    const validos = ['pendiente', 'recibido', 'entregado'];
    if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

    const r = await db.execute({ sql: 'SELECT * FROM manifiesto_pendientes WHERE id=?', args: [req.params.id] });
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    const p = r.rows[0];

    if (estado !== 'pendiente') {
      const existe = await db.execute({ sql: 'SELECT id FROM mbk_envios WHERE codigo=?', args: [p.codigo_sh] });
      if (existe.rows.length === 0) {
        const hoy = new Date().toISOString().slice(0, 10);
        const kg_real = parseFloat(p.peso);
        const vkg = parseFloat(p.precio_kg);
        const costo_total = parseFloat(p.usd);
        const numero = parseInt(p.codigo_sh) || 0;
        const oid = origen_id || null;
        const onombre = origen_nombre || 'SH Manifiesto';
        await db.execute({
          sql: `INSERT INTO mbk_envios
            (codigo, numero, origen_id, origen_nombre, vkg, kg_real, kg_fact, kg_vta,
             volumetrico, costo_total, venta, ganancia, cliente_id, monto_pagado, fecha, notas)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [p.codigo_sh, numero, oid, onombre, vkg, kg_real, kg_real, 60,
                 null, costo_total, parseFloat((kg_real * 60).toFixed(2)), parseFloat((kg_real * 60 - costo_total).toFixed(2)),
                 p.cliente_id || null, 0, hoy, p.cliente || null]
        });
      }
    }

    await db.execute({ sql: 'UPDATE manifiesto_pendientes SET estado=? WHERE id=?', args: [estado, req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cambio de estado masivo
router.patch('/pendientes/bulk-estado', async (req, res) => {
  try {
    const { ids, estado, origen_id, origen_nombre } = req.body;
    const validos = ['pendiente', 'recibido', 'entregado'];
    if (!Array.isArray(ids) || ids.length === 0 || !validos.includes(estado))
      return res.status(400).json({ error: 'Parámetros inválidos' });

    let ok = 0;
    for (const id of ids) {
      try {
        const r = await db.execute({ sql: 'SELECT * FROM manifiesto_pendientes WHERE id=?', args: [id] });
        if (r.rows.length === 0) continue;
        const p = r.rows[0];

        if (estado !== 'pendiente') {
          const existe = await db.execute({ sql: 'SELECT id FROM mbk_envios WHERE codigo=?', args: [p.codigo_sh] });
          if (existe.rows.length === 0) {
            const hoy = new Date().toISOString().slice(0, 10);
            const numero = parseInt(p.codigo_sh) || 0;
            const oid = origen_id || null;
            const onombre = origen_nombre || 'SH Manifiesto';
            await db.execute({
              sql: `INSERT INTO mbk_envios
                (codigo, numero, origen_id, origen_nombre, vkg, kg_real, kg_fact, kg_vta,
                 volumetrico, costo_total, venta, ganancia, cliente_id, monto_pagado, fecha, notas)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              args: [p.codigo_sh, numero, oid, onombre,
                     parseFloat(p.precio_kg), parseFloat(p.peso), parseFloat(p.peso), 60,
                     null, parseFloat(p.usd), parseFloat((parseFloat(p.peso) * 60).toFixed(2)), parseFloat((parseFloat(p.peso) * 60 - parseFloat(p.usd)).toFixed(2)),
                     p.cliente_id || null, 0, hoy, p.cliente || null]
            });
          }
        }
        await db.execute({ sql: 'UPDATE manifiesto_pendientes SET estado=? WHERE id=?', args: [estado, id] });
        ok++;
      } catch {}
    }
    res.json({ ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/pendientes', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Sin filas' });
    const inserted = [];
    for (const r of rows) {
      const precio_kg = r.peso && r.usd ? parseFloat((r.usd / r.peso).toFixed(4)) : 0;
      const result = await db.execute({
        sql: `INSERT INTO manifiesto_pendientes (cliente, codigo_sh, peso, usd, precio_kg) VALUES (?,?,?,?,?) RETURNING *`,
        args: [r.cliente || '', r.codigo_sh || '', parseFloat(r.peso) || 0, parseFloat(r.usd) || 0, precio_kg]
      });
      inserted.push(result.rows[0]);
    }
    res.status(201).json({ insertados: inserted.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/pendientes/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM manifiesto_pendientes WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/pendientes', async (req, res) => {
  try {
    await db.execute('DELETE FROM manifiesto_pendientes');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
