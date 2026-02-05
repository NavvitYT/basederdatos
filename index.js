import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.get("/search/api/user/:user", async (req, res) => {
  const user = req.params.user;

  const q = await pool.query(
    "SELECT data FROM dumps_raw WHERE data LIKE $1 LIMIT 20",
    [`%\"name\":\"${user}\"%`]
  );

  if (q.rows.length === 0) {
    return res.json({ found: false });
  }

  res.json({
    found: true,
    results: q.rows
  });
});

app.listen(3000, () => {
  console.log("API lista en puerto 3000");
});
