const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// --- API All Users ---
router.get('/all-users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const sql = `SELECT user_id, username, department, status FROM users ORDER BY user_id`;
        const result = await client.query(sql);

        const users = result.rows.map(row => ({
            USER_ID: row.user_id,
            USERNAME: row.username,
            DEPARTMENT: row.department,
            STATUS: row.status
        }));

        return res.status(200).json(users);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

// --- API Change Status User ---
router.put('/update-status/:id', async (req, res) => {
    const userId = req.params.id;
    const { status, dept } = req.body;
    let client;

    if (dept !== 'admin' && dept !== 'hr') {
        return res.status(403).json({ status: 'error', message: 'ไม่มีสิทธิ์ใช้งาน' });
    }

    try {
        client = await pool.connect();
        await client.query(`UPDATE users SET status = $1 WHERE user_id = $2`, [status, userId]);
        return res.json({ status: 'success', message: 'เปลี่ยนสถานะสำเร็จ' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

// 🌟 บรรทัดนี้สำคัญที่สุด ห้ามหายเด็ดขาด! 🌟
module.exports = router;