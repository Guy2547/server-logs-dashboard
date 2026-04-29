const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET logs ทั้งหมด
router.get('/all-logs', async (req, res) => {
    try {
        const { search, date, status } = req.query;
        
        // 🌟 ระบุชื่อคอลัมน์ให้ชัดเจน (รวมถึง username ที่เราเพิ่งเพิ่มใน DB ด้วย)
        let query = `
            SELECT 
                log_id, 
                user_id, 
                username, 
                action, 
                client_ip, 
                status, 
                log_time 
            FROM log_activity 
            WHERE 1=1
        `;
        let values = [];
        let valueIndex = 1;

        // ถ้ามีการพิมพ์ค้นหา ID หรือ ชื่อ
        if (search) {
            // ใช้ CAST เพื่อให้ค้นหา user_id ที่เป็นตัวเลขด้วย ILIKE ได้
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

        // 🌟 ส่งข้อมูลกลับไป (Postgres มักส่งชื่อคอลัมน์ตัวเล็กมา เช่น rows[0].username)
        res.json({
            status: 'success',
            data: result.rows
        });
        
    } catch (err) {
        console.error("Logs API Error:", err.message);
        res.status(500).json({ status: 'error', message: 'ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้' });
    }
});

module.exports = router;