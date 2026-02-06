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
  connectionString: process.env.DATABASE_URL
});

// --- RUTA DE BÚSQUEDA ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const searchTerm = `%"name": "${user}"%`;
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data ILIKE $1 LIMIT 50",
      [searchTerm]
    );

    // Mapeamos para limpiar el texto y convertirlo en objeto real de JS
    const results = q.rows.map(row => {
      try {
        // Esto convierte el texto del disco en el JSON que me mostraste
        return JSON.parse(row.data); 
      } catch (e) {
        // Si la línea está corrupta, devuelve el texto plano para no romper la web
        return { raw: row.data };
      }
    });

    // Enviamos el array directo como querías
    res.json(results); 

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en el disco local" });
  }
});

// --- REGISTRO Y LOGIN (Se mantienen igual) ---
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const checkIp = await pool.query("SELECT COUNT(*) FROM usuarios WHERE ip_address = $1", [userIp]);
    if (parseInt(checkIp.rows[0].count) >= 2) return res.status(403).json({ error: "Límite de IPs" });
    await pool.query("INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)", [email, password, userIp]);
    res.status(201).json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const q = await pool.query("SELECT id, email FROM usuarios WHERE email = $1 AND password = $2", [email, password]);
    if (q.rows.length > 0) res.json(q.rows[0]);
    else res.status(401).json({ error: "Fail" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Raw Engine en puerto ${PORT}`);
});
