const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/logs', async (req, res) => {
    try {
        const { search, date, status } = req.query;
        
        // 🌟 ใช้ Alias ตัวพิมพ์ใหญ่ให้ตรงกับที่ Frontend คาดหวัง
        let query = `
            SELECT 
                log_id AS "id", 
                user_id AS "USER_ID", 
                username AS "USERNAME", 
                action AS "ACTION", 
                client_ip AS "CLIENT_IP", 
                status AS "STATUS", 
                TO_CHAR(log_time, 'YYYY-MM-DD HH24:MI:SS') AS "LOG_TIME" 
            FROM log_activity 
            WHERE 1=1
        `;
        let values = [];
        let valueIndex = 1;

        if (search) {
            query += ` AND (CAST(user_id AS TEXT) ILIKE $${valueIndex} OR username ILIKE $${valueIndex})`;
            values.push(`%${search}%`);
            valueIndex++;
        }

        if (date) {
            query += ` AND DATE(log_time) = $${valueIndex}`;
            values.push(date);
            valueIndex++;
        }

        if (status) {
            query += ` AND status = $${valueIndex}`;
            values.push(status);
            valueIndex++;
        }

        query += ' ORDER BY log_time DESC';

        const result = await pool.query(query, values);

        // 🌟 ส่งกลับเป็น Object มาตรฐาน (เพื่อให้ loadLogs ในหน้าบ้านทำงานได้)
        return res.status(200).json({
            status: 'success',
            data: result.rows
        });

    } catch (err) {
        console.error("❌ Logs API Error:", err.message);
        return res.status(500).json({ 
            status: 'error', 
            message: 'ไม่สามารถดึงข้อมูล Logs ได้: ' + err.message 
        });
    }
});

module.exports = router;