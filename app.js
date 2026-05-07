const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const authRoutes  = require('./routes/auth');
const usersRoutes = require('./routes/users');
const logsRoutes  = require('./routes/logs');

dotenv.config();
const app = express();

// ── HTTP Server + Socket.io ───────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.set('io', io);
app.set('trust proxy', 1);

// ── Middleware ────────────────────────────────
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { status: 'error', message: 'คุณพยายามเข้าสู่ระบบบ่อยเกินไป' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// ── Socket ────────────────────────────────────
io.on('connection', (socket) => {
    console.log('⚡ Socket connected:', socket.id);
    socket.on('disconnect', () => console.log('❌ Socket disconnected'));
});

// ── Routes ────────────────────────────────────
// ✅ แก้: mount แยก prefix ให้ตรงกับที่ Frontend เรียก
app.use('/',          authRoutes);   // POST /login
app.use('/api/users', usersRoutes);  // GET  /api/users/all-users, POST /api/users/add
app.use('/api/logs',  logsRoutes);   // GET  /api/logs/logs

// ── Start ─────────────────────────────────────
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

module.exports = { app, httpServer };
