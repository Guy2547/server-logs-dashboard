
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'data707-super-secret-key';

const verifyToken = (req, res, next) => {
    // ดึง token จาก Header
    const authHeader = req.headers['authorization'];

    // Header ต้องมีรูปแบบ: "Bearer xxx.yyy.zzz"
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status  : 'error',
            message : 'ไม่มี Token กรุณาเข้าสู่ระบบก่อน'
        });
    }

    const token = authHeader.split(' ')[1];   // แกะเอาแค่ส่วน xxx.yyy.zzz

    try {
        // ✅ jwt.verify() — ตรวจ 3 อย่างพร้อมกัน:
        // 1. token ถูก sign ด้วย JWT_SECRET ของเราจริงไหม?
        // 2. token หมดอายุหรือยัง? (เช็ค exp ใน payload)
        // 3. โครงสร้าง token ถูกต้องไหม?
        const decoded = jwt.verify(token, JWT_SECRET);

        // ✅ ผ่าน → แนบข้อมูล user ไปกับ request เพื่อให้ route ใช้ต่อได้
        req.user = decoded;   // { userId, name, roles, ip, iat, exp }
        next();               // ไปต่อ

    } catch (err) {
        // token หมดอายุ
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                status  : 'error',
                message : 'Token หมดอายุ กรุณาเข้าสู่ระบบใหม่'
            });
        }
        // token ถูกแก้ไข หรือไม่ถูกต้อง
        return res.status(401).json({
            status  : 'error',
            message : 'Token ไม่ถูกต้อง'
        });
    }
};

module.exports = verifyToken;