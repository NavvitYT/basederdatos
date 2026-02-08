import express from "express";
import pkg from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- 1. CONFIGURACIÓN DE STORAGE (FOTOS) ---
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }

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
  ssl: { rejectUnauthorized: false }
});

// --- 2. RUTAS DE USUARIO (AUTH) ---

app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "Usuario registrado" });
  } catch (err) { res.status(500).json({ error: "Error en registro", detalles: err.message }); }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const user = result.rows[0];
    if (user && user.password === password) {
      res.json({ 
        success: true, 
        user: {
          id: user.id.toString(), 
          email: user.email,
          display_name: user.display_name || user.email.split('@')[0],
          avatar_url: user.avatar_url,
          is_active: user.is_active
        } 
      });
    } else { res.status(401).json({ error: "Credenciales inválidas" }); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 3. PERFIL (SETUP) ---

app.post("/api/user/setup", upload.single('photo'), async (req, res) => {
  try {
    const { userId, newName } = req.body; 
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!userId || !newName) return res.status(400).json({ error: "Faltan datos" });

    const result = await pool.query(
      "UPDATE usuarios SET display_name = $1, avatar_url = $2, is_active = true WHERE id = $3::BIGINT RETURNING id, display_name, avatar_url, is_active",
      [newName, photoUrl, userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    
    res.json({ success: true, user: { ...result.rows[0], id: result.rows[0].id.toString() } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 4. CHAT GLOBAL ---

app.post("/api/chat/send", async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ error: "Datos incompletos" });

    // Verificar si el usuario está activo antes de dejarlo chatear
    const userCheck = await pool.query("SELECT is_active FROM usuarios WHERE id = $1::BIGINT", [userId]);
    
    if (userCheck.rows.length === 0 || !userCheck.rows[0].is_active) {
      return res.status(403).json({ error: "Debes completar tu perfil primero" });
    }

    await pool.query(
      "INSERT INTO mensajes_chat (usuario_id, texto) VALUES ($1::BIGINT, $2)",
      [userId, message]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Error al enviar mensaje" }); }
});

app.get("/api/chat/history", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.texto, u.display_name, u.avatar_url, m.created_at 
      FROM mensajes_chat m 
      JOIN usuarios u ON m.usuario_id = u.id 
      ORDER BY m.created_at ASC LIMIT 50`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Error al cargar chat" }); }
});

// --- 5. FINDER DE MINECRAFT (128GB DATA) ---

app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data->>'name' = $1 LIMIT 100",
      [user]
    );
    res.json(q.rows.map(row => row.data)); 
  } catch (err) { res.status(500).json({ error: "Error en búsqueda", detalles: err.message }); }
});

// --- 6. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine Online en puerto ${PORT}`);
});
