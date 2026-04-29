const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

router.post('/login', async (req, res) => {
    const { USER_ID, PASSWORD } = req.body;
    const io = req.app.get('io'); // 🌟 ย้ายมาไว้ตรงนี้เพื่อให้เรียกใช้ได้
    let client;

    if (!USER_ID || isNaN(USER_ID)) {
        return res.status(400).json({ status: 'error', message: 'USER ID ต้องเป็นตัวเลขเท่านั้น' });
    }

    try {
        client = await pool.connect();
        const clientIp = getClientIp(req);
        const loginTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

        const userResult = await client.query(
            `SELECT username, department, password, status FROM users WHERE user_id = $1`, 
            [USER_ID]
        );

        // กรณีไม่พบ USER
        if (userResult.rows.length === 0) {
            await client.query(
                `INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())`, 
                [USER_ID, '-', 'LOGIN_FAILED', clientIp, 'NOT_FOUND']
            );
            io.emit('new-log'); // 🌟 ตะโกนบอก Dashboard
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(PASSWORD, user.password);

        // กรณีรหัสผ่านผิด
        if (!isMatch) {
            await client.query(
                `INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())`, 
                [USER_ID, user.username, 'LOGIN_FAILED', clientIp, 'WRONG_PASSWORD']
            );
            io.emit('new-log'); // 🌟 ตะโกนบอก Dashboard
            return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // กรณีบัญชีถูกระงับ
        if (user.status !== 'ACTIVE') {
            await client.query(
                `INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())`, 
                [USER_ID, user.username, 'LOGIN_FAILED', clientIp, 'DEACTIVATED']
            );
            io.emit('new-log'); // 🌟 ตะโกนบอก Dashboard
            return res.status(403).json({ status: 'error', message: 'บัญชีของคุณถูกระงับการใช้งาน' }); 
        }

        // กรณี LOGIN สำเร็จ 🌟 เพิ่ม user.username ลงไปด้วย
        await client.query(
            `INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())`, 
            [USER_ID, user.username, 'LOGIN_SUCCESS', clientIp, 'SUCCESS']
        );

        // 🌟 ตะโกนบอกหน้า Dashboard ให้โหลดข้อมูลใหม่แบบ Real-time
        io.emit('new-log', { message: 'มีเหตุการณ์ใหม่เกิดขึ้น!' });

        return res.json({
            status: 'success',
            user: { id: USER_ID, name: user.username, dept: user.department },
            session: { ip: clientIp, loginTime }
        });

    } catch (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้: ' + err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;