import express from "express";
import pkg from "pg";
import cors from "cors";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- CONFIGURACIÓN DE MIDDLEWARES ---
app.use(cors()); 
app.use(express.json());
app.set('trust proxy', true);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// --- RUTAS ---

// 1. Búsqueda Mejorada (Corregida)
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    // Buscamos ignorando mayúsculas/minúsculas y manejando mejor el formato JSON
    // Buscamos la secuencia "name": "el_nombre"
    const searchTerm = `%"name": "${user}"%`;
    
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data ILIKE $1 LIMIT 20",
      [searchTerm]
    );

    res.json({ 
      found: q.rows.length > 0, 
      results: q.rows 
    });
  } catch (err) {
    console.error("Error en búsqueda:", err.message);
    res.status(500).json({ error: "Error interno en el servidor" });
  }
});

// 2. Registro con límite de 2 IPs (Corregido)
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  // Detectar la IP correctamente incluso detrás del proxy de Render
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // Primero verificamos cuántas veces existe esta IP
    const checkIp = await pool.query("SELECT COUNT(*) FROM usuarios WHERE ip_address = $1", [userIp]);
    
    if (parseInt(checkIp.rows[0].count) >= 2) {
      return res.status(403).json({ error: "Límite: Solo 2 cuentas por IP." });
    }

    // Insertar el nuevo usuario
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, userIp]
    );

    res.status(201).json({ message: "Usuario registrado con éxito" });
  } catch (err) {
    console.error("Error en registro:", err.message);
    res.status(500).json({ error: "No se pudo registrar el usuario" });
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
      res.json({ message: "Login exitoso", user: q.rows[0] });
    } else {
      res.status(401).json({ error: "Email o contraseña incorrectos" });
    }
  } catch (err) {
    console.error("Error en login:", err.message);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
  console.log(`🔗 Conectado a la base de datos en tu PC local`);
});
