const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt'); 
const rateLimit = require('express-rate-limit');
const { createServer } = require('http'); // 🌟 เพิ่มตัวสร้าง HTTP Server
const { Server } = require('socket.io'); // 🌟 เพิ่ม Socket.io

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const logsRoutes = require('./routes/logs');

dotenv.config();
const app = express();

// 🌟 สร้าง HTTP Server และ Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// 🌟 ส่งตัว io ไปที่ app เพื่อให้ routes อื่นๆ เรียกใช้ได้ (ใช้ req.app.get('io'))
app.set('io', io);

app.set('trust proxy', 1);

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

// 🌟 จัดการการเชื่อมต่อ Socket
io.on('connection', (socket) => {
    console.log('⚡ มีคนเชื่อมต่อ Socket แล้ว ID:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('❌ การเชื่อมต่อ Socket หลุด');
    });
});

app.use('/', authRoutes);
app.use('/', usersRoutes);
app.use('/', logsRoutes);

// 🌟 เปลี่ยนจาก app.listen เป็น httpServer.listen
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server + Real-time Socket running on port ${PORT}`);
    });
}

module.exports = { app, httpServer }; // ส่งออกทั้งคู่