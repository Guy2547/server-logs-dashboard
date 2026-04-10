const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt'); 
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const logsRoutes = require('./routes/logs');


dotenv.config();
const app = express();

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

console.log("👉 เช็คไฟล์ auth:", typeof authRoutes);
console.log("👉 เช็คไฟล์ users:", typeof usersRoutes);
console.log("👉 เช็คไฟล์ logs:", typeof logsRoutes);

// งานเส้นทาง API
app.use('/', authRoutes);
app.use('/', usersRoutes);
app.use('/', logsRoutes);

// เปิด Server 
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

module.exports = app;