const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt'); // ต้องใช้สำหรับการ Hash รหัสผ่านใหม่

/**
 * 🌟 API: Get All Users
 * ดึงรายชื่อพนักงานทั้งหมดพร้อมสิทธิ์ (Role Name)
 */
router.get('/all-users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // SQL ใหม่: JOIN 3 ตารางเพื่อดึง role_name แทนเลข ID
        const sql = `
            SELECT 
                u.user_id, 
                u.username, 
                u.status, 
                ARRAY_AGG(r.role_name) AS department 
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
            // กรองค่า null ออกหากพนักงานยังไม่มีสิทธิ์
            DEPARTMENT: row.department.filter(role => role !== null), 
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
 * 🌟 API: Add New User (Admin Only)
 * เพิ่มพนักงานใหม่พร้อมสิทธิ์ และเข้ารหัสผ่านทันที
 */
router.post('/add', async (req, res) => {
    const { userId, username, password, roleId } = req.body;
    let client;

    if (!userId || !username || !password || !roleId) {
        return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    try {
        client = await pool.connect();
        
        // 1. ตรวจสอบว่า ID นี้มีอยู่แล้วหรือไม่
        const checkUser = await client.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ status: 'error', message: 'User ID นี้มีอยู่ในระบบแล้ว' });
        }

        // เริ่ม Transaction เพื่อป้องกันข้อมูลลงไม่ครบทั้ง 2 ตาราง
        await client.query('BEGIN');

        // 2. เข้ารหัสรหัสผ่าน (Hash Password)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 3. บันทึกลงตาราง users
        await client.query(
            'INSERT INTO users (user_id, username, password, status) VALUES ($1, $2, $3, $4)',
            [userId, username, hashedPassword, 'ACTIVE']
        );

        // 4. บันทึกลงตาราง user_roles (เก็บเป็น ID ตัวเลข)
        await client.query(
            'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
            [userId, roleId]
        );

        await client.query('COMMIT');
        return res.json({ status: 'success', message: 'ลงทะเบียนพนักงานใหม่สำเร็จ' });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Add User Error:", err);
        return res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    } finally {
        if (client) client.release();
    }
});

/**
 * 🌟 API: Update Status User
 * เปลี่ยนสถานะการใช้งาน (ACTIVE / DEACTIVATED)
 */
router.put('/update-status/:id', async (req, res) => {
    const userId = req.params.id;
    const { status, dept } = req.body;
    let client;

    // เช็คสิทธิ์ผู้ทำรายการ (Admin หรือ HR เท่านั้น)
    let userRoles = Array.isArray(dept) ? dept.map(r => String(r).toLowerCase()) : [];
    const hasPermission = userRoles.includes('admin') || userRoles.includes('hr');

    if (!hasPermission) {
        return res.status(403).json({ status: 'error', message: 'คุณไม่มีสิทธิ์เปลี่ยนสถานะผู้ใช้งาน' });
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

module.exports = router;