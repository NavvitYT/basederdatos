import express from "express";
import pkg from "pg";
import cors from "cors";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

app.use(cors()); 
app.use(express.json());
app.set('trust proxy', true);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, 
    ca: process.env.DB_CERT,
  }
});

// --- RUTA: basededatos.gokucomdohd.pro/api/register ---
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!email || !password) return res.status(400).json({ error: "Faltan datos" });

  try {
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "Usuario registrado" });
  } catch (err) {
    res.status(500).json({ error: "Error en DB", detalles: err.message });
  }
});

// --- RUTA: basededatos.gokucomdohd.pro/api/login ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (result.rows.length > 0 && result.rows[0].password === password) {
      res.json({ success: true, message: "Login correcto" });
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error en login", detalles: err.message });
  }
});

// --- EL FINDER: BÚSQUEDA EXACTA ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user; // Ejemplo: "papas"
  try {
    // CAMBIO CLAVE: Quitamos ILIKE y los % para buscar el nombre exacto
    // Usamos ->> para extraer el texto del JSON y compararlo directamente
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data->>'name' = $1 LIMIT 100",
      [user]
    );
    
    res.json(q.rows.map(row => row.data)); 
  } catch (err) {
    res.status(500).json({ error: "Error en búsqueda", detalles: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine: Búsqueda exacta lista en basededatos.gokucomdohd.pro`);
});
