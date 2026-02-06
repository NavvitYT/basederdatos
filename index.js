import express from "express";
import pkg from "pg";
import cors from "cors";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

app.use(cors()); 
app.use(express.json());
app.set('trust proxy', true);

// Configuración del Pool con el certificado SSL para Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Permite la conexión segura en Render
    ca: process.env.DB_CERT,    // El texto del root.crt que pegaste en el panel
  }
});

// --- RUTA DE BÚSQUEDA HÍBRIDA ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    // Buscamos en 'email' (registros web) O en 'data' (3.4M registros de dumps)
    const q = await pool.query(
      `SELECT email, password, ip_address, data 
       FROM usuarios 
       WHERE email ILIKE $1 
       OR data->>'name' ILIKE $1 
       LIMIT 100`,
      [`%${user}%`]
    );

    const results = q.rows.map(row => {
      // 1. Si tiene email, es un registro directo de tu web
      if (row.email) {
        return {
          source: "Registro Web",
          email: row.email,
          password: row.password,
          ip: row.ip_address,
          date: row.created_at
        };
      } 
      
      // 2. Si no, devolvemos el objeto JSON de los dumps que ya está limpio
      return row.data;
    });

    res.json(results); 

  } catch (err) {
    console.error("❌ Error en la DB:", err);
    res.status(500).json({ error: "Error al consultar la base de datos en la nube" });
  }
});

// --- EJEMPLO RUTA DE REGISTRO WEB ---
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "Usuario registrado en la web" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine: Conectado a la nube (3.4M registros listos)`);
});
