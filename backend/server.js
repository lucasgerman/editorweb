require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/mbk', require('./routes/mbk'));
app.use('/api/bugs', require('./routes/bugs'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/manifiesto', require('./routes/manifiesto'));
app.use('/api/cobros', require('./routes/cobros'));

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 MaxCargo corriendo en http://localhost:${PORT}`);
    console.log(`   Admin:    admin@maxcargo.com / admin123`);
    console.log(`   Empleado: empleado@maxcargo.com / empleado123\n`);
  });
}).catch(e => {
  console.error('Error iniciando DB:', e);
  process.exit(1);
});
