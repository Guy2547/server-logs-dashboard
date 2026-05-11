const express = require('express');
const router  = require('express').Router();
const pool    = require('../config/db');

// ✅ route เป็น / ให้ตรงกับ app.use('/api/logs', logsRoutes) = /api/logs
router.get('/', async (req, res) => {
    try {
        const { search, date, status } = req.query;

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

        // ✅ แก้: ส่ง Array ตรงๆ ให้ตรงกับที่ dashboard-new.js ทำ Array.isArray(data)
        return res.status(200).json(result.rows);

    } catch (err) {
        console.error('❌ Logs API Error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;