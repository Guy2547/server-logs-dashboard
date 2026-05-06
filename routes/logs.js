const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/logs', async (req, res) => {
    try {
        const { search, date, status } = req.query;
        
        let query = `
            SELECT 
                log_id AS id, 
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

        // ถ้ามีการพิมพ์ค้นหา ID หรือ ชื่อ
        if (search) {
            //  CAST เพื่อให้ค้นหา user_id ที่เป็นตัวเลขด้วย 
            query += ` AND (CAST(user_id AS TEXT) ILIKE $${valueIndex} OR username ILIKE $${valueIndex})`;
            values.push(`%${search}%`);
            valueIndex++;
        }

        // ถ้ามีการเลือกวันที่
        if (date) {
            query += ` AND DATE(log_time) = $${valueIndex}`;
            values.push(date);
            valueIndex++;
        }

        // ถ้ามีการเลือกสถานะ
        if (status) {
            query += ` AND status = $${valueIndex}`;
            values.push(status);
            valueIndex++;
        }

        query += ' ORDER BY log_time DESC';

        const result = await pool.query(query, values);

        // 🌟 ส่งข้อมูลกลับไปเป็น Array โดยตรง เพื่อให้ตรงกับ API Spec v3.0
        return res.status(200).json(result.rows);
        
    } catch (err) {
        console.error("Logs API Error:", err.message);
        return res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้' });
    }
});

module.exports = router;