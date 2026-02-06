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

// --- 1. RUTA DE REGISTRO (WEB) ---
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  // Obtenemos la IP para guardarla en la columna ip_address de tu imagen
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!email || !password) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    // Insertamos en las columnas específicas de tu imagen
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "¡Registrado correctamente!" });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Error de duplicado en CockroachDB
      res.status(400).json({ error: "El email ya existe" });
    } else {
      res.status(500).json({ error: "Error al registrar" });
    }
  }
});

// --- 2. RUTA DE LOGIN (WEB) ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Buscamos al usuario por email
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const user = result.rows[0];

    // Comparación directa sin bcrypt (texto plano)
    if (user.password === password) {
      res.json({ 
        success: true, 
        message: "Login exitoso",
        user: { email: user.email, ip: user.ip_address }
      });
    } else {
      res.status(401).json({ error: "Contraseña incorrecta" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// --- 3. RUTA DE BÚSQUEDA (LA QUE YA FUNCIONABA) ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const q = await pool.query(
      `SELECT email, password, ip_address, data 
       FROM usuarios 
       WHERE email ILIKE $1 
       OR data->>'name' ILIKE $1 
       LIMIT 100`,
      [`%${user}%`]
    );

    const results = q.rows.map(row => {
      if (row.email) {
        return { source: "Registro Web", email: row.email, password: row.password, ip: row.ip_address };
      } 
      return row.data;
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Error de conexión" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify activo en puerto ${PORT}`);
});
