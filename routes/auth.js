const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');   // ✅ เพิ่ม JWT
const fs      = require('fs');
const path    = require('path');

// Secret key สำหรับ sign token — ควรเก็บใน .env
const JWT_SECRET  = process.env.JWT_SECRET  || 'data707-super-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';   // token หมดอายุใน 8 ชั่วโมง

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function logUnknownUser(userId, clientIp) {
    const logFilePath = path.join(__dirname, '../logs/unauthorized_access.log');
    const timestamp   = new Date().toLocaleString('th-TH');
    fs.appendFile(logFilePath,
        `[${timestamp}] ID: ${userId} | IP: ${clientIp} | Status: NOT_FOUND_IN_DB\n`,
        (err) => { if (err) console.error('📝 บันทึกล้มเหลว:', err); }
    );
}

// ── POST /login ───────────────────────────────
router.post('/login', async (req, res) => {
    const { USER_ID, PASSWORD } = req.body;
    const io = req.app.get('io');
    let client;

    console.log(`--- 🚀 Login Attempt for ID: ${USER_ID} ---`);

    if (!USER_ID || isNaN(USER_ID)) {
        return res.status(400).json({ status: 'error', message: 'USER ID ต้องเป็นตัวเลขเท่านั้น' });
    }

    try {
        client = await pool.connect();
        const clientIp = getClientIp(req);

        const { rows } = await client.query(`
            SELECT u.username, u.first_name, u.last_name, u.password, u.status,
                ARRAY_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL) AS department
            FROM users u
            LEFT JOIN user_roles ur ON u.user_id  = ur.user_id
            LEFT JOIN roles r       ON ur.role_id = r.role_id
            WHERE u.user_id = $1
            GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.password, u.status
        `, [USER_ID]);

        // กรณีที่ 1: ไม่พบ ID
        if (rows.length === 0) {
            logUnknownUser(USER_ID, clientIp);
            await client.query(
                'INSERT INTO log_activity (user_id,username,action,client_ip,status,log_time) VALUES ($1,$2,$3,$4,$5,NOW())',
                [USER_ID, '-', 'LOGIN_FAILED', clientIp, 'NOT_FOUND']
            );
            if (io) io.emit('new-log');
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        const user        = rows[0];
        const displayName = user.first_name || user.username;
        const isMatch     = await bcrypt.compare(PASSWORD, user.password);

        // กรณีที่ 2: รหัสผ่านผิด
        if (!isMatch) {
            await client.query(
                'INSERT INTO log_activity (user_id,username,action,client_ip,status,log_time) VALUES ($1,$2,$3,$4,$5,NOW())',
                [USER_ID, displayName, 'LOGIN_FAILED', clientIp, 'WRONG_PASSWORD']
            );
            if (io) io.emit('new-log');
            return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // กรณีที่ 3: บัญชีถูกระงับ
        if (user.status !== 'ACTIVE') {
            await client.query(
                'INSERT INTO log_activity (user_id,username,action,client_ip,status,log_time) VALUES ($1,$2,$3,$4,$5,NOW())',
                [USER_ID, displayName, 'LOGIN_FAILED', clientIp, 'DEACTIVATED']
            );
            if (io) io.emit('new-log');
            return res.status(403).json({ status: 'error', message: 'บัญชีของคุณถูกระงับการใช้งาน' });
        }

        // กรณีที่ 4: Login สำเร็จ → สร้าง JWT
        const userRoles = user.department || [];

        // ✅ jwt.sign() — ใส่ข้อมูลที่ต้องการลงใน token
        // Payload ที่อยู่ใน token (ใครก็อ่านได้ ห้ามใส่ password)
        const token = jwt.sign(
            {
                userId  : USER_ID,           // รหัสพนักงาน
                name    : displayName,        // ชื่อ
                roles   : userRoles,          // สิทธิ์
                ip      : clientIp,           // IP ตอน login
            },
            JWT_SECRET,                       // ลายเซ็น server
            { expiresIn: JWT_EXPIRES }        // หมดอายุ 8 ชม.
        );

        await client.query(
            'INSERT INTO log_activity (user_id,username,action,client_ip,status,log_time) VALUES ($1,$2,$3,$4,$5,NOW())',
            [USER_ID, displayName, 'LOGIN_SUCCESS', clientIp, 'SUCCESS']
        );
        if (io) io.emit('new-log');

        console.log(`✅ Login Success: ${displayName} | Token issued`);

        return res.json({
            status : 'success',
            token,           
            user   : {
                id   : USER_ID,
                name : displayName,
                dept : userRoles,
            }
        });

    } catch (err) {
        console.error('🔥 Server Error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Server Error: ' + err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;