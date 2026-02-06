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

// --- RUTA DE BÚSQUEDA (LA QUE ARREGLA TODO) ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const searchTerm = `%"name": "${user}"%`;
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data ILIKE $1 LIMIT 50",
      [searchTerm]
    );

    const results = q.rows.map(row => {
      // 1. Limpiamos la línea de espacios y comas locas al final
      let cleanData = row.data.trim();
      if (cleanData.endsWith(',')) cleanData = cleanData.slice(0, -1);

      try {
        // 2. Intentamos convertirlo en objeto JSON real
        const parsed = JSON.parse(cleanData);
        
        // Si el JSON no trae IP de servidor, le ponemos una etiqueta para que no quede vacío
        if (!parsed.serverip && !parsed.ip) {
          parsed.origin_info = "Data sin IP de servidor origen";
        }
        
        return parsed; 
      } catch (e) {
        // 3. Si la línea está rota (como las que viste con "raw"), la mandamos limpia
        // pero intentamos que el frontend vea algo útil
        return { 
          name: user, 
          status: "Registro Parcial",
          raw_content: cleanData 
        };
      }
    });

    res.json(results); 

  } catch (err) {
    console.error("Error en disco local:", err.message);
    res.status(500).json({ error: "Error en el servidor de almacenamiento" });
  }
});

// --- REGISTRO Y LOGIN ---
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const checkIp = await pool.query("SELECT COUNT(*) FROM usuarios WHERE ip_address = $1", [userIp]);
    if (parseInt(checkIp.rows[0].count) >= 2) return res.status(403).json({ error: "Límite: 2 cuentas por IP." });
    await pool.query("INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)", [email, password, userIp]);
    res.status(201).json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: "Error en DB" }); }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const q = await pool.query("SELECT id, email FROM usuarios WHERE email = $1 AND password = $2", [email, password]);
    if (q.rows.length > 0) res.json(q.rows[0]);
    else res.status(401).json({ error: "No encontrado" });
  } catch (err) { res.status(500).json({ error: "Error en DB" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine: Todo el contenido JSON habilitado`);
});
