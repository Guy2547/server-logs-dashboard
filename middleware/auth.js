const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'data707-super-secret-key';

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'error',
            message: 'ไม่มี Token กรุณาเข้าสู่ระบบก่อน'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: 'error',
                message: 'Token หมดอายุ กรุณาเข้าสู่ระบบใหม่'
            });
        }
        return res.status(401).json({
            status: 'error',
            message: 'Token ไม่ถูกต้อง'
        });
    }
};

const verifyAdmin = (req, res, next) => {
    if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('ADMIN')) {
        return res.status(403).json({
            status: 'error',
            message: 'ต้องเป็น Admin เท่านั้น'
        });
    }
    next();
};

module.exports = { verifyToken, verifyAdmin };
