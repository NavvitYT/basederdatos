import express from "express";
import pkg from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- 1. CONFIGURACIÓN DE ARCHIVOS (AVATARES) ---
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, 'uploads/'); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);
app.use('/uploads', express.static('uploads'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false,
    ca: process.env.DB_CERT // Certificado de CockroachLabs
  }
});

// --- 2. RUTAS DE USUARIO (LOGIN ARREGLADO PARA EVITAR UNDEFINED) ---

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const user = result.rows[0];

    if (user && user.password === password) {
      // MAPEAMOS LOS CAMPOS PARA QUE EL FRONTEND NO RECIBA UNDEFINED
      res.json({ 
        success: true, 
        user: {
          id: user.id,
          userId: user.id, // Doble referencia por si acaso
          email: user.email,
          display_name: user.display_name || user.email.split('@')[0], // Fallback al email si no hay nombre
          avatar_url: user.avatar_url,
          is_active: user.is_active || false
        } 
      });
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error en login", detalles: err.message });
  }
});

app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "Usuario registrado" });
  } catch (err) {
    res.status(500).json({ error: "Error en registro", detalles: err.message });
  }
});

// --- 3. EL FINDER DE MINECRAFT (128GB DATA) ---

app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data->>'name' = $1 LIMIT 100",
      [user]
    );
    res.json(q.rows.map(row => row.data)); 
  } catch (err) {
    res.status(500).json({ error: "Error en búsqueda", detalles: err.message });
  }
});

// --- 4. CHAT GLOBAL Y PERFIL (SOCIAL) ---

// Setup de perfil: Sube foto y activa al usuario
app.post("/api/user/setup", upload.single('photo'), async (req, res) => {
  const { email, newName } = req.body;
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await pool.query(
      "UPDATE usuarios SET display_name = $1, avatar_url = $2, is_active = true WHERE email = $3 RETURNING *",
      [newName, photoUrl, email]
    );
    
    // Devolvemos el usuario actualizado para refrescar el LocalStorage
    res.json({ 
      success: true, 
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        display_name: result.rows[0].display_name,
        avatar_url: result.rows[0].avatar_url,
        is_active: true
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Error en setup de perfil", detalles: err.message });
  }
});

// Enviar mensaje al Chat Global
app.post("/api/chat/send", async (req, res) => {
  const { email, message } = req.body;
  try {
    const userRes = await pool.query("SELECT id, is_active FROM usuarios WHERE email = $1", [email]);
    const user = userRes.rows[0];

    if (!user || !user.is_active) {
      return res.json({ action: "NEED_PROFILE", message: "Debes configurar tu perfil para hablar." });
    }

    await pool.query("INSERT INTO mensajes_chat (usuario_id, texto) VALUES ($1, $2)", [user.id, message]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
});

// Obtener historial del Chat
app.get("/api/chat/history", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.texto, u.display_name, u.avatar_url, m.created_at 
      FROM mensajes_chat m 
      JOIN usuarios u ON m.usuario_id = u.id 
      ORDER BY m.created_at ASC LIMIT 50`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al cargar historial" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Finder Engine Online`));
