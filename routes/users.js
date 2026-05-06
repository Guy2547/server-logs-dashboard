const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt'); //

/**
 * API: Get All Users
 */
router.get('/all-users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const sql = `
            SELECT u.user_id, u.username, u.status, ARRAY_AGG(r.role_name) AS department 
            FROM users u 
            LEFT JOIN user_roles ur ON u.user_id = ur.user_id 
            LEFT JOIN roles r ON ur.role = r.role_id
            GROUP BY u.user_id, u.username, u.status 
            ORDER BY u.user_id
        `;
        const result = await client.query(sql);
        const users = result.rows.map(row => ({
            USER_ID: row.user_id,
            USERNAME: row.username,
            DEPARTMENT: (row.department || []).filter(role => role !== null), 
            STATUS: row.status
        }));
        return res.status(200).json(users);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * API: Add New User (Admin Only)
 */
router.post('/add', async (req, res) => {
    const { userId, username, password, roleId } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        
        // Hash รหัสผ่านก่อนลง DB
        const hashedPassword = await bcrypt.hash(password, 10);

        await client.query(
            'INSERT INTO users (user_id, username, password, status) VALUES ($1, $2, $3, $4)',
            [userId, username, hashedPassword, 'ACTIVE']
        );
        await client.query(
            'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
            [userId, roleId]
        );

        await client.query('COMMIT');
        res.json({ status: 'success', message: 'เพิ่มพนักงานเรียบร้อย' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;