const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ip = require('ip');

const app = express();
const PORT = 3000;

// Enable CORS so mobile phones can connect
app.use(cors());
app.use(express.static('public')); // Serve the HTML frontend
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure Storage (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Safe filename: timestamp-originalName
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// In-memory database (reset when server restarts)
// Structure: { sessionId: [ { fileName, originalName, size, url } ] }
let db = {};

// --- API ROUTES ---

// 1. Upload File
app.post('/api/upload', upload.single('file'), (req, res) => {
    const { sessionId } = req.body;
    const file = req.file;

    if (!sessionId || !file) {
        return res.status(400).json({ error: 'Missing session ID or file' });
    }

    // Create session if it doesn't exist
    if (!db[sessionId]) db[sessionId] = [];

    // Save file info
    const fileData = {
        id: Date.now().toString(),
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        url: `http://${ip.address()}:${PORT}/uploads/${file.filename}`,
        createdAt: Date.now()
    };

    db[sessionId].push(fileData);

    console.log(`[${sessionId}] Uploaded: ${file.originalname}`);
    res.json(fileData);
});

// 2. Get Files for Session
app.get('/api/files/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const files = db[sessionId] || [];
    // Sort by newest first
    res.json(files.sort((a, b) => b.createdAt - a.createdAt));
});

// 3. Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running!`);
    console.log(`---------------------------------------------`);
    console.log(`📂 Local Access:   http://localhost:${PORT}`);
    console.log(`📲 Mobile Access:  http://${ip.address()}:${PORT}`);
    console.log(`---------------------------------------------\n`);
});