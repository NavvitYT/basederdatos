import express from "express";
import pkg from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import 'dotenv/config';

const { Pool } = pkg;
const app = express();

// --- 1. CONFIGURACIÓN DE CARPETAS Y MULTER ---
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

// --- 2. ENDPOINT: SETUP DE PERFIL (EL QUE DABA ERROR 500) ---
app.post("/api/user/setup", upload.single('photo'), async (req, res) => {
  try {
    // Extraemos userId como string para evitar problemas con números grandes
    const { userId, newName } = req.body; 
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    console.log(`Buscando usuario ID: ${userId} para actualizar...`);

    if (!userId || !newName) {
      return res.status(400).json({ error: "Faltan campos: userId o newName" });
    }

    // UPDATE: Usamos el ID como string para CockroachDB
    const query = `
      UPDATE usuarios 
      SET display_name = $1, avatar_url = $2, is_active = true 
      WHERE id = $3::string
      RETURNING id, email, display_name, avatar_url, is_active;
    `;

    const result = await pool.query(query, [newName, photoUrl, userId]);

    // Si result.rows es vacío, el ID no existe en la DB
    if (result.rows.length === 0) {
      console.error("❌ Usuario no encontrado en la DB");
      return res.status(404).json({ error: "Usuario no encontrado. El ID no existe en CockroachDB." });
    }
    
    console.log("✅ Perfil actualizado correctamente");
    res.json({ 
      success: true, 
      user: result.rows[0]
    });

  } catch (err) {
    console.error("🔥 Error Interno:", err.message);
    res.status(500).json({ 
      error: "Error interno del servidor", 
      detalles: err.message 
    });
  }
});

// --- 3. TUS OTRAS RUTAS (MANTENIDAS) ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const user = result.rows[0];
    if (user && user.password === password) {
      res.json({ 
        success: true, 
        user: {
          id: user.id.toString(), // Siempre enviar ID como string
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

// Resto de rutas (Search, Register, Chat history...) se mantienen igual.

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Finder Engine Online on port ${PORT}`));
