const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const bcrypt  = require('bcrypt');

// ── GET /api/users/all-users ──────────────────
router.get('/all-users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { rows } = await client.query(`
            SELECT u.user_id, u.first_name, u.last_name, u.username, u.status,
                ARRAY_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL) AS department
            FROM users u
            LEFT JOIN user_roles ur ON u.user_id  = ur.user_id
            LEFT JOIN roles r       ON ur.role_id = r.role_id
            GROUP BY u.user_id, u.first_name, u.last_name, u.username, u.status
            ORDER BY u.user_id
        `);
        return res.json(rows.map(row => ({
            USER_ID    : row.user_id,
            FIRST_NAME : row.first_name || '',
            LAST_NAME  : row.last_name  || '',
            USERNAME   : row.username,
            STATUS     : row.status,
            DEPARTMENT : row.department || [],
        })));
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

// ── GET /api/users/roles ──────────────────────
router.get('/roles', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { rows } = await client.query('SELECT role_id, role_name FROM roles ORDER BY role_id');
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

// ── POST /api/users/add ───────────────────────
router.post('/add', async (req, res) => {
    const { userId, firstName, lastName, password, roleId } = req.body;
    if (!userId || !firstName || !lastName || !password || !roleId)
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุข้อมูลให้ครบ' });

    const username = `${firstName} ${lastName}`.trim();
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const hashed = await bcrypt.hash(String(password), 10);
        await client.query(
            `INSERT INTO users (user_id, first_name, last_name, username, password, status)
             VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
            [userId, firstName, lastName, username, hashed]
        );
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [userId, roleId]);
        await client.query('COMMIT');
        return res.status(201).json({ status: 'success', message: 'เพิ่มพนักงานเรียบร้อย' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(409).json({ status: 'error', message: 'userId นี้มีในระบบแล้ว' });
        if (err.code === '23503') return res.status(400).json({ status: 'error', message: `roleId ไม่มีในระบบ` });
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

// ── PUT /api/users/update-user/:userId ────────
router.put('/update-user/:userId', async (req, res) => {
    const { userId } = req.params;
    
    // 🌟 แก้ตรงนี้: เปลี่ยนจาก roleIds เป็น roleId (ไม่มี s) เพื่อให้ตรงกับหน้าบ้าน
    const { firstName, lastName, roleId } = req.body;

    if (!firstName || !lastName)
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุ firstName และ lastName' });

    const username = `${firstName} ${lastName}`.trim();
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(
            'UPDATE users SET first_name=$1, last_name=$2, username=$3 WHERE user_id=$4',
            [firstName, lastName, username, userId]
        );

        // 🌟 แก้ตรงนี้: เปลี่ยนมาใช้ roleId
        if (Array.isArray(roleId) && roleId.length > 0) {
            await client.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
            for (const rId of roleId) {
                await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [userId, rId]);
            }
        }

        await client.query('COMMIT');
        return res.json({ status: 'success', message: 'แก้ไขข้อมูลเรียบร้อย' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

// ── PUT /api/users/update-status/:userId ──────
router.put('/update-status/:userId', async (req, res) => {
    const { userId } = req.params;
    const { status }  = req.body;
    if (!['ACTIVE','DEACTIVATED'].includes(status))
        return res.status(400).json({ status: 'error', message: 'status ต้องเป็น ACTIVE หรือ DEACTIVATED' });
    let client;
    try {
        client = await pool.connect();
        const r = await client.query('UPDATE users SET status=$1 WHERE user_id=$2', [status, userId]);
        if (r.rowCount === 0) return res.status(404).json({ status: 'error', message: 'ไม่พบ user นี้' });
        return res.json({ status: 'success', message: 'อัปเดตสถานะเรียบร้อย' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

// ── POST /api/users/verify-identity ──────────
// ยืนยันตัวตนด้วย userId + birthdate
router.post('/verify-identity', async (req, res) => {
    const { userId, birthdate } = req.body;
    if (!userId || !birthdate)
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุ userId และ birthdate' });
    let client;
    try {
        client = await pool.connect();
        const { rows } = await client.query(
            'SELECT user_id FROM users WHERE user_id=$1 AND birthdate=$2',
            [userId, birthdate]
        );
        if (rows.length === 0)
            return res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูล หรือวันเกิดไม่ตรง' });
        return res.json({ status: 'success', message: 'ยืนยันตัวตนสำเร็จ' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

// ── POST /api/users/reset-password ───────────
router.post('/reset-password', async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword)
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุ userId และ newPassword' });
    if (String(newPassword).length < 6)
        return res.status(400).json({ status: 'error', message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว' });
    let client;
    try {
        client = await pool.connect();
        const hashed = await bcrypt.hash(String(newPassword), 10);
        const r = await client.query('UPDATE users SET password=$1 WHERE user_id=$2', [hashed, userId]);
        if (r.rowCount === 0) return res.status(404).json({ status: 'error', message: 'ไม่พบ user นี้' });
        return res.json({ status: 'success', message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

module.exports = router;