const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const rateLimit  = require('express-rate-limit');
const { createServer } = require('http');
const { Server }       = require('socket.io');

const authRoutes  = require('./routes/auth');
const usersRoutes = require('./routes/users');
const logsRoutes  = require('./routes/logs');

dotenv.config();
const app = express();

// ── JWT Middleware (inline เพื่อหลีกเลี่ยงปัญหา import) ──
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'data707-super-secret-key';

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'ไม่มี Token กรุณาเข้าสู่ระบบก่อน' });
    }
    const token = authHeader.split(' ')[1];
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ status: 'error', message: 'Token หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        }
        return res.status(401).json({ status: 'error', message: 'Token ไม่ถูกต้อง' });
    }
};

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.set('io', io);
app.set('trust proxy', 1);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
// Public — ไม่ต้องมี token
app.use('/', authRoutes);
app.use('/api/users', usersRoutes);

// Protected — ต้องมี token
app.use('/api/logs', verifyToken, logsRoutes);

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

module.exports = { app, httpServer };