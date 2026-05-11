const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'data707-super-secret-key';

// ── ตรวจสอบ Token ────────────────────────────
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

// ── ตรวจสอบว่าเป็น Admin ──────────────────────
// ✅ รองรับทั้ง 'admin' และ 'ADMIN' (case-insensitive)
const verifyAdmin = (req, res, next) => {
    verifyToken(req, res, () => {
        const roles = (req.user?.roles || []).map(r => String(r).toLowerCase());
        if (roles.includes('admin')) {
            return next();
        }
        return res.status(403).json({ status: 'error', message: 'ต้องเป็น Admin เท่านั้น' });
    });
};

module.exports = { verifyToken, verifyAdmin };