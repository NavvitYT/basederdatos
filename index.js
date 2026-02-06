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

// --- RUTA DE BÚSQUEDA: MODO ESPEJO (LO QUE HAY EN EL DISCO SALE A LA WEB) ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    // Buscamos en tu disco de 128GB sin piedad
    const searchTerm = `%"name": "${user}"%`;
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data ILIKE $1 LIMIT 100",
      [searchTerm]
    );

    // NO HAY MAP, NO HAY PARSE, NO HAY FILTROS. 
    // Enviamos el texto crudo tal cual está en la columna 'data'
    const rawResults = q.rows.map(row => row.data);

    res.json(rawResults); 

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en el disco local" });
  }
});

// --- REGISTRO Y LOGIN (MANTENLOS POR SI ACASO) ---
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    await pool.query("INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)", [email, password, userIp]);
    res.status(201).send("OK");
  } catch (err) { res.status(500).send("Error"); }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const q = await pool.query("SELECT * FROM usuarios WHERE email = $1 AND password = $2", [email, password]);
    res.json(q.rows[0] || { error: "No" });
  } catch (err) { res.status(500).send("Error"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MODO BRUTO ACTIVADO. Escupiendo el disco de 128GB tal cual.`);
});
