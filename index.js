import express from "express";
import pkg from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- 1. CONFIGURACIÓN DE FOTOS ---
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, 'uploads/'); },
  filename: (req, file, cb) => { cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`); }
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
    ca: process.env.DB_CERT, // Mantenemos tu config de certificado
  }
});

// --- 2. TUS RUTAS ORIGINALES (REGISTER & LOGIN) ---

app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!email || !password) return res.status(400).json({ error: "Faltan datos" });
  try {
    await pool.query(
      "INSERT INTO usuarios (email, password, ip_address) VALUES ($1, $2, $3)",
      [email, password, ip]
    );
    res.json({ success: true, message: "Usuario registrado" });
  } catch (err) { res.status(500).json({ error: "Error en DB", detalles: err.message }); }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (result.rows.length > 0 && result.rows[0].password === password) {
      res.json({ success: true, message: "Login correcto", user: result.rows[0] });
    } else { res.status(401).json({ error: "Credenciales inválidas" }); }
  } catch (err) { res.status(500).json({ error: "Error en login" }); }
});

// --- 3. EL FINDER DE MINECRAFT (BÚSQUEDA EXACTA EN 128GB) ---

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

// --- 4. NUEVAS RUTAS: PERFIL Y CHAT GLOBAL ---

// Configurar el perfil con foto (se activa el usuario)
app.post("/api/user/setup", upload.single('photo'), async (req, res) => {
  const { email, newName } = req.body;
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    await pool.query(
      "UPDATE usuarios SET display_name = $1, avatar_url = $2, is_active = true WHERE email = $3",
      [newName, photoUrl, email]
    );
    res.json({ success: true, photoUrl });
  } catch (err) { res.status(500).json({ error: "Error en setup" }); }
});

// Enviar mensaje al Chat Global
app.post("/api/chat/send", async (req, res) => {
  const { email, message } = req.body;
  try {
    const userRes = await pool.query("SELECT id, is_active FROM usuarios WHERE email = $1", [email]);
    const user = userRes.rows[0];

    if (!user || !user.is_active) {
      return res.json({ action: "NEED_PROFILE" });
    }

    await pool.query("INSERT INTO mensajes_chat (usuario_id, texto) VALUES ($1, $2)", [user.id, message]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Error al enviar mensaje" }); }
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
  } catch (err) { res.status(500).json({ error: "Error al cargar chat" }); }
});

// --- 5. INICIO ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine Online en basededatos.gokucomdohd.pro`);
});
