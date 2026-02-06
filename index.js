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

app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;
  try {
    const searchTerm = `%"name": "${user}"%`;
    const q = await pool.query(
      "SELECT data FROM dumps_raw WHERE data ILIKE $1 LIMIT 100",
      [searchTerm]
    );

    const results = q.rows.map(row => {
      let raw = row.data.trim();

      // --- LOGICA DE REPARACIÓN DE LÍNEA ---
      // 1. Quitar comas al final
      if (raw.endsWith(',')) raw = raw.slice(0, -1);
      
      // 2. Si la línea no empieza con {, se la ponemos (porque está rota en tu disco)
      if (!raw.startsWith('{')) raw = '{' + raw;
      
      // 3. Si no termina con }, se la ponemos
      if (!raw.endsWith('}')) raw = raw + '}';

      try {
        // Intentamos enviarlo como JSON limpio
        return JSON.parse(raw);
      } catch (e) {
        // Si falla hasta con la reparación, mandamos la línea tal cual para que no te falte info
        return { error: "Línea muy dañada", content: raw };
      }
    });

    res.json(results); 

  } catch (err) {
    res.status(500).json({ error: "Error en el disco de 128GB" });
  }
});

// ... (Login/Register igual)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine: Reparando JSONs rotos en vivo`);
});
