const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const rateLimit  = require('express-rate-limit');
const { createServer } = require('http');
const { Server }       = require('socket.io');

const authRoutes  = require('./routes/auth');
const usersRoutes = require('./routes/users');
const logsRoutes  = require('./routes/logs');
const verifyToken = require('./middleware/auth');   // ✅ JWT Middleware

dotenv.config();
const app = express();

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.set('io', io);
app.set('trust proxy', 1);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']   // ✅ อนุญาต Authorization header
}));
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 100,
    message: { status: 'error', message: 'คุณพยายามเข้าสู่ระบบบ่อยเกินไป' },
    standardHeaders: true, legacyHeaders: false,
});
app.use(limiter);

io.on('connection', (socket) => {
    console.log('⚡ Socket connected:', socket.id);
    socket.on('disconnect', () => console.log('❌ Socket disconnected'));
});

// ── Routes ────────────────────────────────────
// /login ไม่ต้องมี token (Public route)
app.use('/', authRoutes);

// ✅ /api/* ต้องมี token ทุก request (Protected routes)
// verifyToken จะทำงานก่อน usersRoutes และ logsRoutes เสมอ
app.use('/api/users', verifyToken, usersRoutes);
app.use('/api/logs',  verifyToken, logsRoutes);

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

module.exports = { app, httpServer };