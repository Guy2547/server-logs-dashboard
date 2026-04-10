const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GETlogsทั้งหมด
router.get('/all-logs', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const sql = `SELECT l.log_id, l.user_id, u.username, l.action, l.client_ip, l.status,
                     to_char(l.log_time + interval '7 hours', 'DD/MM/YYYY HH24:MI') AS formatted_time
                     FROM log_activity l
                     LEFT JOIN users u ON l.user_id = u.user_id
                     ORDER BY l.log_time DESC`;
                     
        const result = await client.query(sql);

        const logs = result.rows.map(row => ({
            LOG_ID: row.log_id,
            USER_ID: row.user_id,
            USERNAME: row.username || 'Unknown',
            ACTION: row.action,
            CLIENT_IP: row.client_ip,
            STATUS: row.status,
            LOG_TIME: row.formatted_time
        }));

        return res.status(200).json(logs);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

// ลบประวัติ
router.delete('/delete-log/:id', async (req, res) => {
    const logId = req.params.id;
    const { dept } = req.body;
    let client;

    if (dept !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'เฉพาะ Admin เท่านั้นที่มีสิทธิ์ลบ' });
    }

    try {
        client = await pool.connect();
        const result = await client.query(`DELETE FROM log_activity WHERE log_id = $1`, [logId]);

        if (result.rowCount > 0) {
            return res.json({ status: 'success', message: 'ลบข้อมูลสำเร็จ' });
        }

        return res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูลที่ต้องการลบ' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;