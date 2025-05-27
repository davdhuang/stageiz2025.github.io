const express = require("express");
const multer = require("multer");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const pdfParse = require("pdf-parse");
const osc = require("osc");


const app = express();

// Multer : configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const originalName = path.parse(file.originalname).name;
    const sanitized = originalName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "");
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${sanitized}${ext}`;
    console.log("✅ Nom final du fichier :", uniqueName);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// Initialisation du port OSC
const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 57121,           // Port sur lequel Node écoute (Max envoie ici)
  remoteAddress: "127.0.0.1", // IP de Max
  remotePort: 7400            // Port sur lequel Max reçoit les messages
});

udpPort.on("ready", () => {
  console.log("🔌 Port OSC prêt : Node.js ↔ Max/MSP");
});

udpPort.open();


// SQLite : initialisation
const db = new sqlite3.Database("./files.db", (err) => {
  if (err) console.error("Erreur DB :", err);
  else console.log("📦 Base SQLite connectée");
});

db.run(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    fileUrl TEXT,
    txtUrl TEXT,
    content TEXT
  )
`);

app.use("/uploads", express.static("uploads"));
app.use(express.static(__dirname));

// Routes
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/fichiers", (_, res) => {
  res.sendFile(path.join(__dirname, "fichiers.html"));
});

// POST /upload
app.post("/upload", upload.single("pdfFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu." });

  console.log("📂 Fichier reçu et renommé :", req.file.filename);

  const filePath = req.file.path;
  const fileUrl = `http://localhost:5050/uploads/${req.file.filename}`;
  const baseName = path.parse(req.file.filename).name;
  const txtFilePath = path.join(__dirname, "uploads", `${baseName}.txt`);
  const txtUrl = `http://localhost:5050/uploads/${baseName}.txt`;

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    const text = parsed.text.trim();

    // Envoi du contenu texte (ou résumé) à Max via OSC
udpPort.send({
  address: "/pdf/text",
  args: [
    {
      type: "s",
      value: text.substring(0, 512) // Envoie les 512 premiers caractères max
    }
  ]
});


    // Vérification si contenu PDF déjà existant
    db.get("SELECT id FROM files WHERE content = ?", [text], (err, row) => {
      if (err) {
        console.error("❌ Erreur DB :", err);
        return res.status(500).json({ message: "Erreur DB." });
      }

      if (row) {
        fs.unlinkSync(filePath); // Supprime le PDF
        return res.status(400).json({ message: "PDF déjà existant (contenu identique)." });
      }

      // Sauvegarde du texte
      fs.writeFileSync(txtFilePath, text, "utf8");

      // Insertion en base
      db.run(
        "INSERT INTO files (name, fileUrl, txtUrl, content) VALUES (?, ?, ?, ?)",
        [req.file.originalname, fileUrl, txtUrl, text],
        function (err) {
          if (err) {
            console.error("❌ Erreur insertion DB :", err);
            return res.status(500).json({ message: "Erreur insertion DB." });
          }
          res.json({ fileUrl, txtUrl });
        }
      );
    });
  } catch (e) {
    console.error("❌ Erreur lecture PDF :", e);
    res.status(500).json({ message: "Erreur lecture PDF." });
  }
});


app.get("/files", (req, res) => {
  db.all("SELECT id, name, fileUrl, txtUrl FROM files", (err, rows) => {
    if (err) return res.status(500).json({ message: "Erreur récupération fichiers." });
    res.json(rows);
  });
});


app.delete("/delete-all", (req, res) => {
  const uploadsDir = path.join(__dirname, "uploads");

  try {
    if (fs.existsSync(uploadsDir)) {
      fs.readdirSync(uploadsDir).forEach(file => {
        const filePath = path.join(uploadsDir, file);
        fs.unlinkSync(filePath);
      });
    }

    db.run("DELETE FROM files", [], (err) => {
      if (err) return res.status(500).json({ message: "Erreur suppression DB." });
      res.json({ message: "Tous les fichiers ont été supprimés." });
    });
  } catch (err) {
    console.error("Erreur suppression :", err);
    res.status(500).json({ message: "Erreur système lors de la suppression." });
  }
});

app.listen(5050, () => {
  console.log("🚀 Serveur lancé : http://localhost:5050");
});
