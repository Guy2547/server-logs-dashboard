const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GETlogsทั้งหมด
router.get('/all-logs', async (req, res) => {
    let client;
    try {
        const { search, date, status } = req.query;
        
        let query = 'SELECT * FROM log_activity WHERE 1=1';
        let values = [];
        let valueIndex = 1;

        // ถ้ามีการพิมพ์ค้นหา ID หรือ ชื่อ
        if (search) {
            query += ` AND (user_id ILIKE $${valueIndex} OR username ILIKE $${valueIndex})`;
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

        query += ' ORDER BY log_time DESC'; // เรียงจากล่าสุดไปเก่าสุด

        const result = await pool.query(query, values);
        res.json(result.rows);
        
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้' });
    }
});
module.exports = router;