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
    // Buscamos en el disco de 128GB
    const searchTerm = `%"name": "${user}"%`;
    const q = await pool.query(
      "SELECT id, data FROM dumps_raw WHERE data ILIKE $1 LIMIT 50",
      [searchTerm]
    );

    const formattedResults = q.rows.map(row => {
      let extraido;
      try {
        // Intentamos convertir el texto a un objeto JSON real
        extraido = JSON.parse(row.data);
      } catch (e) {
        // Si no es JSON perfecto (como las líneas rotas que vimos), lo mandamos como texto
        extraido = { raw_data: row.data };
      }

      return {
        id: row.id,
        servidor: "MC-SERVER-DATABASE", // Aquí puedes cambiar el nombre del server
        detalles: extraido // <--- AQUÍ VA TODO: IP, PASSWORD, NAME, ETC.
      };
    });

    res.json({ 
      found: q.rows.length > 0, 
      results: formattedResults 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ... (Rutas de Login y Register se mantienen igual)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mardify Engine Corriendo - Mostrando todo el JSON`);
});
