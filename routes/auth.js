const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');

/**
 * ฟังก์ชันช่วยดึง IP Address
 */
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
           req.socket?.remoteAddress || 
           req.ip || 
           '127.0.0.1';
}

/**
 * API: Login
 */
router.post('/login', async (req, res) => {
    const { USER_ID, PASSWORD } = req.body;
    const io = req.app.get('io'); 
    let client;

    console.log(`--- Login Attempt for ID: ${USER_ID} ---`);

    if (!USER_ID || isNaN(USER_ID)) {
        return res.status(400).json({ status: 'error', message: 'USER ID ต้องเป็นตัวเลขเท่านั้น' });
    }

    try {
        client = await pool.connect();
        const clientIp = getClientIp(req);

        // 1. ดึงข้อมูลจากตาราง users (เช็คชื่อคอลัมน์ให้ดีว่า username หรือ USERNAME)
        const userResult = await client.query(
            'SELECT username, department, password, status FROM users WHERE user_id = $1', 
            [USER_ID]
        );

        if (userResult.rows.length === 0) {
            console.log("❌ User not found in DB");
            await client.query(
                'INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())', 
                [USER_ID, '-', 'LOGIN_FAILED', clientIp, 'NOT_FOUND']
            );
            if (io) io.emit('new-log');
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        const user = userResult.rows[0];
        console.log("✅ Found User:", user.username); // เช็คใน Logs Railway ว่าชื่อขึ้นไหม

        const isMatch = await bcrypt.compare(PASSWORD, user.password);

        if (!isMatch) {
            console.log("❌ Password Mismatch");
            await client.query(
                'INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())', 
                [USER_ID, user.username, 'LOGIN_FAILED', clientIp, 'WRONG_PASSWORD']
            );
            if (io) io.emit('new-log');
            return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        if (user.status !== 'ACTIVE') {
            console.log("❌ User is Deactivated");
            await client.query(
                'INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())', 
                [USER_ID, user.username, 'LOGIN_FAILED', clientIp, 'DEACTIVATED']
            );
            if (io) io.emit('new-log');
            return res.status(403).json({ status: 'error', message: 'บัญชีของคุณถูกระงับการใช้งาน' }); 
        }

        // 2. บันทึก Login สำเร็จ พร้อม Username
        console.log(`📝 Saving Log for: ${user.username}`);
        await client.query(
            'INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())', 
            [USER_ID, user.username, 'LOGIN_SUCCESS', clientIp, 'SUCCESS']
        );

        // 3. ส่งสัญญาณ Real-time
        if (io) {
            console.log("📣 Socket: Emitting new-log");
            io.emit('new-log');
        }

        return res.json({
            status: 'success',
            user: { id: USER_ID, name: user.username, dept: user.department }
        });

    } catch (err) {
        console.error("🔥 Error in /login:", err.message);
        return res.status(500).json({ status: 'error', message: 'Server Error' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;