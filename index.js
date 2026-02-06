import express from "express";
import pkg from "pg";
import cors from "cors";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- CONFIGURACIÓN ---
app.use(cors()); 
app.use(express.json());
app.set('trust proxy', true);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// --- RUTAS ---

// 1. Búsqueda con información de Servidor
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const searchTerm = `%"name": "${user}"%`;
    
    // Traemos los datos de tu disco de 128GB
    const q = await pool.query(
      "SELECT id, data FROM dumps_raw WHERE data ILIKE $1 LIMIT 40",
      [searchTerm]
    );

    // Formateamos los resultados para que el frontend sepa qué mostrar
    const formattedResults = q.rows.map(row => {
      return {
        id: row.id,
        servidor: "MARDIFY-LOCAL-STORAGE", // Aquí puedes poner el nombre de tu servidor
        contenido: row.data,
        fecha_registro: new Date().toLocaleDateString() 
      };
    });

    res.json({ 
      found: q.rows.length > 0, 
      results: formattedResults 
    });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Error conectando con el disco local" });
  }
});

// 2. Registro (Asegúrate de haber corrido: ALTER TABLE usuarios ADD COLUMN ip_address TEXT;)
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const checkIp = await pool.query("SELECT COUNT(*) FROM usuarios WHERE ip_address = $1", [userIp]);
    
    if (parseInt(checkIp.rows[0].count) >= 2) {
      return res.status(403).json({ error: "Máximo 2 cuentas por IP." });
    }

    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, userIp]
    );

    res.status(201).json({ message: "Registrado en Mardify" });
  } catch (err) {
    res.status(500).json({ error: "Error en base de datos local" });
  }
});

// 3. Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const q = await pool.query(
      "SELECT id, email FROM usuarios WHERE email = $1 AND password = $2",
      [email, password]
    );

    if (q.rows.length > 0) {
      res.json({ message: "Bienvenido", user: q.rows[0] });
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error de conexión" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Sistema Mardify Online en puerto ${PORT}`);
  console.log(`💿 Almacenamiento: Disco 128GB conectado`);
});
