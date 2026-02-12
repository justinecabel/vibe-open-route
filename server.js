
import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { GoogleGenAI, Type } from '@google/genai';

const sqlite = sqlite3.verbose();
const app = express();
const port = process.env.PORT || 3001;

const DB_PATH = './routes.db';
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const db = new sqlite.Database(DB_PATH, (err) => {
  if (err) console.error('DB Error:', err);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author TEXT,
    waypoints TEXT,
    path TEXT,
    color TEXT,
    score INTEGER DEFAULT 0,
    votes INTEGER DEFAULT 0,
    createdAt INTEGER,
    lastRefinedAt INTEGER
  )`);
});

app.use(cors());
app.use(express.json());

app.get('/api/routes', (req, res) => {
  db.all("SELECT * FROM routes ORDER BY score DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      waypoints: JSON.parse(row.waypoints || '[]'),
      path: JSON.parse(row.path || '[]')
    })));
  });
});

app.post('/api/routes', (req, res) => {
  const r = req.body;
  const sql = `INSERT INTO routes (id, name, author, waypoints, path, color, score, votes, createdAt, lastRefinedAt) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET 
               name=excluded.name, author=excluded.author, waypoints=excluded.waypoints, path=excluded.path, lastRefinedAt=excluded.lastRefinedAt`;
  
  const params = [
    r.id, r.name, r.author, 
    JSON.stringify(r.waypoints), JSON.stringify(r.path), 
    r.color, r.score || 0, r.votes || 0, r.createdAt, Date.now()
  ];

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json(r);
  });
});

app.patch('/api/routes/:id/vote', (req, res) => {
  const { id } = req.params;
  const { delta } = req.body;
  db.run("UPDATE routes SET score = score + ?, votes = votes + 1 WHERE id = ?", [delta, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get("SELECT * FROM routes WHERE id = ?", [id], (err, row) => {
      res.json({ ...row, waypoints: JSON.parse(row.waypoints), path: JSON.parse(row.path) });
    });
  });
});

app.post('/api/analyze', async (req, res) => {
  const { routeName } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Provide a commuter guide for the Philippine public transport route: ${routeName}. Identify key landmarks and tips for riders.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            guide: { type: Type.STRING },
            landmarks: { type: Type.ARRAY, items: { type: Type.STRING } },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["guide", "landmarks", "tips"]
        }
      }
    });
    res.json(JSON.parse(response.text.trim()));
  } catch (error) {
    res.status(500).json({ guide: "Analysis failed.", landmarks: [], tips: [] });
  }
});

app.listen(port, () => console.log(`API on ${port}`));
