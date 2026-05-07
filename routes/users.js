const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const bcrypt  = require('bcrypt');

// ── GET /api/users/all-users ──────────────────
router.get('/all-users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const sql = `
            SELECT
                u.user_id,
                u.username,
                u.status,
                ARRAY_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL) AS department
            FROM users u
            LEFT JOIN user_roles ur ON u.user_id  = ur.user_id
            LEFT JOIN roles r       ON ur.role_id = r.role_id
            GROUP BY u.user_id, u.username, u.status
            ORDER BY u.user_id
        `;
        const { rows } = await client.query(sql);
        const users = rows.map(row => ({
            USER_ID    : row.user_id,
            USERNAME   : row.username,
            STATUS     : row.status,
            DEPARTMENT : row.department || [],
        }));
        return res.status(200).json(users);
    } catch (err) {
        console.error('[GET /all-users]', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

// ── POST /api/users/add ───────────────────────
router.post('/add', async (req, res) => {
    const { userId, username, password, roleId } = req.body;

    if (!userId || !username || !password || !roleId) {
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุ userId, username, password และ roleId' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const hashedPassword = await bcrypt.hash(String(password), 10);

        await client.query(
            'INSERT INTO users (user_id, username, password, status) VALUES ($1, $2, $3, $4)',
            [userId, username, hashedPassword, 'ACTIVE']
        );
        await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
            [userId, roleId]
        );

        await client.query('COMMIT');
        return res.status(201).json({ status: 'success', message: 'เพิ่มพนักงานเรียบร้อย' });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('[POST /add]', err.message);
        if (err.code === '23505') return res.status(409).json({ status: 'error', message: 'userId หรือ username นี้มีในระบบแล้ว' });
        if (err.code === '23503') return res.status(400).json({ status: 'error', message: `roleId "${roleId}" ไม่มีในระบบ` });
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

// ── PUT /api/users/update-status/:userId ──────
router.put('/update-status/:userId', async (req, res) => {
    const { userId } = req.params;
    const { status }  = req.body;

    if (!['ACTIVE', 'DEACTIVATED'].includes(status)) {
        return res.status(400).json({ status: 'error', message: 'status ต้องเป็น ACTIVE หรือ DEACTIVATED' });
    }

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'UPDATE users SET status = $1 WHERE user_id = $2',
            [status, userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ status: 'error', message: 'ไม่พบ user นี้ในระบบ' });
        }
        return res.json({ status: 'success', message: 'อัปเดตสถานะเรียบร้อย' });
    } catch (err) {
        console.error('[PUT /update-status]', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
