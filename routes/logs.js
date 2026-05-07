const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * 📊 API: ดึงประวัติการใช้งานระบบ (GET /api/logs/logs)
 */
router.get('/logs', async (req, res) => {
    try {
        const { search, date, status } = req.query;
        
        // 🌟 ตั้งชื่อ Alias ให้เป็นตัวพิมพ์ใหญ่ เพื่อให้ตรงกับ Frontend
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

        // ฟิลเตอร์: ค้นหาด้วย ID หรือ ชื่อ
        if (search) {
            query += ` AND (CAST(user_id AS TEXT) ILIKE $${valueIndex} OR username ILIKE $${valueIndex})`;
            values.push(`%${search}%`);
            valueIndex++;
        }

        // ฟิลเตอร์: วันที่ (YYYY-MM-DD)
        if (date) {
            query += ` AND DATE(log_time) = $${valueIndex}`;
            values.push(date);
            valueIndex++;
        }

        // ฟิลเตอร์: สถานะ (SUCCESS, FAILED, etc.)
        if (status) {
            query += ` AND status = $${valueIndex}`;
            values.push(status);
            valueIndex++;
        }

        query += ' ORDER BY log_time DESC';

        const result = await pool.query(query, values);

        // 🌟 ส่งกลับเป็น Object ตามมาตรฐานที่หน้าบ้านต้องการ
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