const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const bcrypt  = require('bcrypt');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// ── GET /api/users/all-users ──────────────────
router.get('/all-users', verifyToken, async (req, res) => {
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
router.get('/roles', verifyToken, async (req, res) => {
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
router.post('/add', verifyToken, verifyAdmin, async (req, res) => {
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
        // บันทึก role ตอนเพิ่ม user ใหม่
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [userId, roleId]);
        await client.query('COMMIT');
        return res.status(201).json({ status: 'success', message: 'เพิ่มพนักงานเรียบร้อย' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(409).json({ status: 'error', message: 'userId นี้มีในระบบแล้ว' });
        return res.status(500).json({ status: 'error', message: err.message });
    } finally { if (client) client.release(); }
});

// ── PUT /api/users/update-user/:userId ────────
router.put('/update-user/:userId', verifyToken, verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    const { firstName, lastName, roleId, role_id, dept } = req.body;

    if (!firstName || !lastName)
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุ firstName และ lastName' });

    const normalizeRoleIds = (value) => {
        if (value == null) return undefined;
        if (Array.isArray(value)) return value;
        return [value];
    };

    let roleIds = normalizeRoleIds(roleId) || normalizeRoleIds(role_id) || normalizeRoleIds(dept);
    if (roleIds !== undefined) {
        roleIds = roleIds
            .map((r) => Number(r))
            .filter((r) => !Number.isNaN(r));
    }

    const username = `${firstName} ${lastName}`.trim();
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. อัปเดตข้อมูลพื้นฐาน
        const updateResult = await client.query(
            'UPDATE users SET first_name=$1, last_name=$2, username=$3 WHERE user_id=$4',
            [firstName, lastName, username, userId]
        );
        if (updateResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'ไม่พบ user นี้' });
        }

        // 2. อัปเดตสิทธิ์ (Roles) เฉพาะเมื่อส่ง role มา
        if (roleIds !== undefined) {
            await client.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
            for (const rId of roleIds) {
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
router.put('/update-status/:userId', verifyToken, verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    const { status }  = req.body;
    if (!['ACTIVE','DEACTIVATED'].includes(status))
        return res.status(400).json({ status: 'error', message: 'สถานะไม่ถูกต้อง' });
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
router.post('/verify-identity', async (req, res) => {
    const { userId, birthdate } = req.body;
    if (!userId || !birthdate)
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุข้อมูลให้ครบ' });
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
        return res.status(400).json({ status: 'error', message: 'กรุณาระบุข้อมูลให้ครบ' });
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