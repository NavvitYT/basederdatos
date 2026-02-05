import express from "express";
import pkg from "pg";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// Middleware para leer JSON
app.use(express.json());

// Confía en los headers de IP (necesario para el límite de 2 cuentas)
app.set('trust proxy', true);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// --- RUTA ORIGINAL: BÚSQUEDA DE USUARIOS ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data LIKE $1 LIMIT 20",
      [`%\"name\":\"${user}\"%`]
    );

    if (q.rows.length === 0) {
      return res.json({ found: false });
    }

    res.json({
      found: true,
      results: q.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTA NUEVA: REGISTRO (Máximo 2 por IP) ---
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const userIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // 1. Contar cuántas cuentas tiene esta IP
    const checkIp = await pool.query(
      "SELECT COUNT(*) FROM usuarios WHERE ip_address = $1", 
      [userIp]
    );
    
    if (parseInt(checkIp.rows[0].count) >= 2) {
      return res.status(403).json({ error: "Límite alcanzado: Máximo 2 cuentas por IP." });
    }

    // 2. Insertar nuevo usuario (Texto plano)
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, userIp]
    );

    res.status(201).json({ message: "Usuario registrado", ip: userIp });

  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: "El email ya existe." });
    } else {
      res.status(500).json({ error: "Error: " + err.message });
    }
  }
});

// --- RUTA NUEVA: LOGIN ---
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const q = await pool.query(
      "SELECT id, email FROM usuarios WHERE email = $1 AND password = $2",
      [email, password]
    );

    if (q.rows.length > 0) {
      res.json({ message: "Login exitoso", user: q.rows[0] });
    } else {
      res.status(401).json({ error: "Credenciales incorrectas" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

app.listen(3000, () => {
  console.log("🚀 Servidor híbrido corriendo en puerto 3000");
  console.log("✅ Búsqueda, Registro (Límite IP) y Login activos.");
});
