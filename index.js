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
    ca: process.env.DB_CERT, // Asegúrate de tener esta variable en Render
  }
});

// --- RUTA: basededatos.gokucomdohd.pro/api/register ---
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // ESTO VA A LA TABLA USUARIOS (WEB)
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "Registro completado en la tabla usuarios" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar: tal vez el email ya existe" });
  }
});

// --- RUTA: basededatos.gokucomdohd.pro/api/login ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    // BUSCA SOLO EN LA TABLA USUARIOS (ACCESO WEB)
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    
    if (result.rows.length > 0 && result.rows[0].password === password) {
      res.json({ success: true, message: "Login correcto" });
    } else {
      res.status(401).json({ error: "Credenciales inválidas para el Finder" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error en el login" });
  }
});

// --- RUTA DEL FINDER (Busca en los 3.4M de registros) ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    // ESTO BUSCA EN LA TABLA DUMPS_RAW (MINECRAFT DATA)
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data->>'name' ILIKE $1 LIMIT 100",
      [`%${user}%`]
    );
    res.json(q.rows.map(row => row.data)); 
  } catch (err) {
    res.status(500).json({ error: "Error consultando dumps_raw" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine en linea para basededatos.gokucomdohd.pro`);
});
