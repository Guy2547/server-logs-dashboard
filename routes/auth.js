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

        // 1. ตรวจสอบข้อมูลผู้ใช้งานก่อน
        const userResult = await client.query(
            'SELECT username, department, password, status FROM users WHERE user_id = $1', 
            [USER_ID]
        );

        // --- กรณีที่ 1: ไม่พบไอดี ---
        if (userResult.rows.length === 0) {
            console.log("❌ User not found");
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
            // 🌟 ใช้ Subquery ดึงชื่อมาใส่เพื่อความชัวร์
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

        if (userResult.rows.length === 0) {
            console.log("❌ User not found in DB");
    
            const clientIp = getClientIp(req);
    
            // 🌟 เรียกใช้ฟังก์ชันบันทึกข้อมูลลงไฟล์
             logUnknownUser(USER_ID, clientIp); 

            if (io) io.emit('new-log');
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
}

        // --- กรณีที่ 4: Login สำเร็จ (ไม้ตายสุดท้าย) ---
        console.log(`📝 บันทึก Log สำเร็จสำหรับ: ${user.username}`);
        
        // 🌟 บังคับให้ DB ดึงชื่อจากตาราง users มาใส่ใน log_activity โดยตรง
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

        return res.json({
            status: 'success',
            user: { id: USER_ID, name: user.username, dept: user.department }
        });

    } catch (err) {
        console.error("🔥 Server Error:", err.message);
        return res.status(500).json({ status: 'error', message: 'Server Error: ' + err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;