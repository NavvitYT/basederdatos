import express from "express";
import pkg from "pg";
import cors from "cors"; // <--- 1. Importamos CORS
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- CONFIGURACIÓN DE MIDDLEWARES ---
app.use(cors()); // <--- 2. ¡ESTO ARREGLA EL ERROR DE NETWORK!
app.use(express.json());
app.set('trust proxy', true);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// --- TUS RUTAS (SEARCH, REGISTER, LOGIN) ---

// Búsqueda original
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data LIKE $1 LIMIT 20",
      [`%\"name\":\"${user}\"%`]
    );
    res.json({ found: q.rows.length > 0, results: q.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registro con límite de 2 IPs
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const userIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const checkIp = await pool.query("SELECT COUNT(*) FROM usuarios WHERE ip_address = $1", [userIp]);
    if (parseInt(checkIp.rows[0].count) >= 2) {
      return res.status(403).json({ error: "Límite: Solo 2 cuentas por IP." });
    }

    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, userIp]
    );
    res.status(201).json({ message: "Usuario registrado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login (Sin encriptar, directo a Neon)
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
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("🚀 Servidor corriendo en http://localhost:3000 con CORS activado");
});
