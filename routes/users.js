const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');

//---------------------------
//GET user ทั้งหมด 
//---------------------------
router.get('/all-users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const sql = `
            SELECT 
                u.user_id AS "USER_ID", 
                u.username AS "USERNAME", 
                u.status AS "STATUS", 
                ARRAY_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL) AS "DEPARTMENT"
            FROM users u
            LEFT JOIN user_roles ur ON u.user_id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.role_id
            GROUP BY u.user_id, u.username, u.status
            ORDER BY u.user_id ASC
        `;
        const result = await client.query(sql);
        return res.status(200).json(result.rows);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * ➕ เพิ่มพนักงานใหม่ + Hash รหัสผ่าน
 */
router.post('/add', async (req, res) => {
    const { userId, username, password, roleId } = req.body;
    let client;

    if (!userId || !username || !password || !roleId) {
        return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบ' });
    }

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // บันทึกตาราง users
        await client.query(
            'INSERT INTO users (user_id, username, password, status) VALUES ($1, $2, $3, $4)',
            [userId, username, hashedPassword, 'ACTIVE']
        );

        // บันทึกตารางสิทธิ์
        await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
            [userId, roleId]
        );

        await client.query('COMMIT');
        res.status(201).json({ status: 'success', message: 'เพิ่มพนักงานสำเร็จ' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;