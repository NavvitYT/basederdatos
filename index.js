import express from "express";
import pkg from "pg";
import cors from "cors";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

app.use(cors()); 
app.use(express.json());
app.set('trust proxy', true);

// Conexión con certificado SSL obligatorio para Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, 
    ca: process.env.DB_CERT, // Asegúrate de que esta variable tenga el texto del root.crt
  }
});

// --- RUTA DE REGISTRO: basededatos.gokucomdohd.pro/api/register ---
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // Validación básica
  if (!email || !password) {
    return res.status(400).json({ error: "Faltan datos: envía email y password" });
  }

  try {
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "Usuario registrado en la tabla usuarios" });
  } catch (err) {
    console.error("❌ ERROR EN REGISTRO:", err.message);
    res.status(500).json({ 
      error: "Error interno en la base de datos",
      detalles: err.message, // ESTO te dirá si falta la tabla o la columna
      hint: "Asegúrate de haber creado la tabla 'usuarios' con las columnas correctas."
    });
  }
});

// --- RUTA DE LOGIN: basededatos.gokucomdohd.pro/api/login ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "El usuario no existe en la web" });
    }

    const user = result.rows[0];

    if (user.password === password) {
      res.json({ success: true, message: "Bienvenido al Finder", user: user.email });
    } else {
      res.status(401).json({ error: "Contraseña incorrecta" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error en el login", detalles: err.message });
  }
});

// --- RUTA DEL FINDER: Busca en los 3.4M de registros de dumps_raw ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data->>'name' ILIKE $1 LIMIT 100",
      [`%${user}%`]
    );
    res.json(q.rows.map(row => row.data)); 
  } catch (err) {
    res.status(500).json({ error: "Error buscando en dumps_raw", detalles: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine: Activo para basededatos.gokucomdohd.pro`);
});
