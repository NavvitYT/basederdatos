import express from "express";
import pkg from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- 1. CONFIGURACIÓN DE STORAGE ---
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

// --- 2. EL FIX: SETUP DE PERFIL ---
app.post("/api/user/setup", upload.single('photo'), async (req, res) => {
  try {
    const { userId, newName } = req.body; 
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!userId || !newName) {
      return res.status(400).json({ error: "Faltan datos obligatorios." });
    }

    // EL TRUCO: Forzamos el ID a BIGINT ($3::BIGINT) para que CockroachDB 
    // lo acepte aunque el frontend lo mande como string.
    const query = `
      UPDATE usuarios 
      SET display_name = $1, avatar_url = $2, is_active = true 
      WHERE id = $3::BIGINT
      RETURNING id, display_name, avatar_url, is_active;
    `;

    const result = await pool.query(query, [newName, photoUrl, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No se encontró el usuario en la base de datos." });
    }
    
    res.json({ 
      success: true, 
      user: {
        ...result.rows[0],
        id: result.rows[0].id.toString() // Devolvemos como string para el frontend
      }
    });

  } catch (err) {
    console.error("🔥 Error de CockroachDB:", err.message);
    res.status(500).json({ 
      error: "Error en la base de datos", 
      detalles: err.message 
    });
  }
});

// --- 3. LOGIN (MANTENIDO Y SEGURO) ---
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
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 4. FINDER (128GB DISK CONNECTION) ---
app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    // Buscamos en tu tabla de 128GB
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data->>'name' = $1 LIMIT 100",
      [user]
    );
    res.json(q.rows.map(row => row.data)); 
  } catch (err) { res.status(500).json({ error: "Error en búsqueda", detalles: err.message }); }
});

// --- 5. CHAT GLOBAL ---
app.get("/api/chat/history", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.texto, u.display_name, u.avatar_url, m.created_at 
      FROM mensajes_chat m 
      JOIN usuarios u ON m.usuario_id = u.id 
      ORDER BY m.created_at ASC LIMIT 50`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Error de chat" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Finder Engine Online en puerto ${PORT}`));
