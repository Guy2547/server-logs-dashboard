const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const fs = require('fs'); 
const path = require('path'); 

/**
 * ฟังก์ชันช่วยดึง IP Address
 */
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
           req.socket?.remoteAddress || 
           req.ip || 
           '127.0.0.1';
}

const logUnknownUser = (userId, clientIp) => {
    const logFilePath = path.join(__dirname, '../logs/unauthorized_access.log'); 
    const timestamp = new Date().toLocaleString('th-TH'); // เวลาไทย

    const logEntry = `[${timestamp}] ID: ${userId} | IP: ${clientIp} | Status: NOT_FOUND_IN_DB\n`;
    // เขียนต่อท้ายไฟล์เดิม (ถ้าไม่มีไฟล์จะสร้างให้เอง)
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) console.error("📝 บันทึกลงไฟล์ล้มเหลว:", err);
    });
};

/**
 * API: Login
 */
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

        // 🌟 1. แก้ไข SQL ตรงนี้: ดึงข้อมูลและมัดรวม Role จากตาราง user_roles เป็น Array
        const userResult = await client.query(`
            SELECT u.username, u.password, u.status, ARRAY_AGG(ur.role) AS department
            FROM users u
            LEFT JOIN user_roles ur ON u.user_id = ur.user_id
            WHERE u.user_id = $1
            GROUP BY u.user_id, u.username, u.password, u.status
        `, [USER_ID]);

        // --- กรณีที่ 1: ไม่พบไอดี ---
        if (userResult.rows.length === 0) {
            console.log("❌ User not found in DB");
            
            // 🌟 ย้าย logUnknownUser มาไว้ตรงนี้ (รวมกันไว้จุดเดียวให้ถูกต้อง)
            logUnknownUser(USER_ID, clientIp); 

            await client.query(
                'INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, $5, NOW())', 
                [USER_ID, '-', 'LOGIN_FAILED', clientIp, 'NOT_FOUND']
            );
            if (io) io.emit('new-log');
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(PASSWORD, user.password);

        // --- กรณีที่ 2: รหัสผ่านผิด ---
        if (!isMatch) {
            console.log(`❌ Password Mismatch for: ${user.username}`);
            await client.query(`
                INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) 
                VALUES ($1, (SELECT username FROM users WHERE user_id = $1), $2, $3, $4, NOW())`, 
                [USER_ID, 'LOGIN_FAILED', clientIp, 'WRONG_PASSWORD']
            );
            if (io) io.emit('new-log');
            return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // --- กรณีที่ 3: บัญชีโดนแบน ---
        if (user.status !== 'ACTIVE') {
            console.log(`❌ Account Deactivated: ${user.username}`);
            await client.query(`
                INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) 
                VALUES ($1, (SELECT username FROM users WHERE user_id = $1), $2, $3, $4, NOW())`, 
                [USER_ID, 'LOGIN_FAILED', clientIp, 'DEACTIVATED']
            );
            if (io) io.emit('new-log');
            return res.status(403).json({ status: 'error', message: 'บัญชีของคุณถูกระงับการใช้งาน' }); 
        }

        // --- กรณีที่ 4: Login สำเร็จ (ไม้ตายสุดท้าย) ---
        console.log(`📝 บันทึก Log สำเร็จสำหรับ: ${user.username}`);
        
        await client.query(`
            INSERT INTO log_activity (user_id, username, action, client_ip, status, log_time) 
            VALUES (
                $1, 
                (SELECT username FROM users WHERE user_id = $1), 
                'LOGIN_SUCCESS', 
                $2, 
                'SUCCESS', 
                NOW()
            )`, 
            [USER_ID, clientIp]
        );

        // ส่งสัญญาณ Real-time บอก Dashboard
        if (io) {
            console.log("📣 Socket: ส่งสัญญาณอัปเดตหน้า Dashboard");
            io.emit('new-log');
        }

        // 🌟 กรองค่า Null ทิ้ง (กรณีบาง User ยังไม่ได้ใส่สิทธิ์ในฐานข้อมูล)
        const userRoles = user.department.filter(role => role !== null);

        // ส่งข้อมูลที่อัปเกรดแล้วกลับไปให้หน้าเว็บ
        return res.json({
            status: 'success',
            user: { 
                id: USER_ID, 
                name: user.username, 
                dept: userRoles // จะถูกส่งไปเป็นกล่อง Array เช่น ['it', 'hr']
            }
        });

    } catch (err) {
        console.error("🔥 Server Error:", err.message);
        return res.status(500).json({ status: 'error', message: 'Server Error: ' + err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;