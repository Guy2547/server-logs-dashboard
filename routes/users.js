const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// API All Users 
router.get('/all-users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // 🌟 โค้ด SQL แบบใหม่: ดึงข้อมูลจาก 2 ตารางมา Join กัน แล้วมัดรวม role ด้วย ARRAY_AGG
        const sql = `
            SELECT u.user_id, u.username, u.status, ARRAY_AGG(ur.role) AS department 
            FROM users u 
            LEFT JOIN user_roles ur ON u.user_id = ur.user_id 
            GROUP BY u.user_id, u.username, u.status 
            ORDER BY u.user_id
        `;
        const result = await client.query(sql);

        const users = result.rows.map(row => ({
            USER_ID: row.user_id,
            USERNAME: row.username,
            // 🌟 กรองค่า null ออก (เผื่อกรณีที่ User คนนั้นเพิ่งถูกสร้างและยังไม่มีสิทธิ์ในตาราง user_roles)
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

// API Change Status User 
router.put('/update-status/:id', async (req, res) => {
    const userId = req.params.id;
    const { status, dept } = req.body;
    let client;

    let userRoles = [];
    if (Array.isArray(dept)) {
        userRoles = dept.map(r => typeof r === 'string' ? r.toLowerCase() : '');
    } else if (typeof dept === 'string') {
        userRoles = [dept.toLowerCase()]; // เผื่อส่งมาเป็น string เดี่ยวๆ
    }

    const hasPermission = userRoles.includes('admin') || userRoles.includes('hr');

    if (!hasPermission) {
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

module.exports = router;