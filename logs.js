const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();
const app = express();

// 1. เปิด CORS แบบครอบจักรวาล (ป้องกันเบราว์เซอร์บล็อก)
app.use(cors());

// 2. ตัวอ่าน JSON
app.use(express.json());

// 3. ยามรักษาความปลอดภัย
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { status: 'error', message: 'คุณพยายามเข้าสู่ระบบบ่อยเกินไป' },
    standardHeaders: true, 
    legacyHeaders: false,
});
app.use(limiter);

// 4. ตั้งค่า Database แบบฉลาด (ใช้แค่ URL เส้นเดียวที่ Railway ให้มา)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

// 🌟 [ของใหม่] หน้าทดสอบระบบ ถ้าเปิดเว็บแล้วเห็นข้อความนี้แปลว่าเซิร์ฟเวอร์ทำงาน 100%
app.get('/', (req, res) => {
    res.send('✅ API is Online and CORS is working perfectly!');
});

// --- Login API ---
app.post('/login', async (req, res) => {
    const { USER_ID, PASSWORD } = req.body;
    let client; // ประกาศตัวแปรไว้ก่อน

    if (!USER_ID || isNaN(USER_ID)) {
        return res.status(400).json({ status: 'error', message: 'USER ID ต้องเป็นตัวเลขเท่านั้น' });
    }

    try {
        // 🌟 ย้ายการเชื่อมต่อฐานข้อมูลเข้ามาอยู่ในตาข่ายนิรภัย (Try) ถ้าพัง เซิร์ฟเวอร์ก็จะไม่ดับ!
        client = await pool.connect();
        const clientIp = getClientIp(req);
        const loginTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

        const userResult = await client.query(
            `SELECT username, department, password, status FROM users WHERE user_id = $1`, 
            [USER_ID]
        );

        if (userResult.rows.length === 0) {
            await client.query(`INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`, [USER_ID, 'LOGIN_FAILED', clientIp, 'NOT_FOUND']);
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        const user = userResult.rows[0];

        if (user.password !== PASSWORD) {
            await client.query(`INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`, [USER_ID, 'LOGIN_FAILED', clientIp, 'WRONG_PASSWORD']);
            return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        if (user.status !== 'ACTIVE') {
            await client.query(`INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`, [USER_ID, 'LOGIN_FAILED', clientIp, 'DEACTIVATED']);
            return res.status(403).json({ status: 'error', message: 'บัญชีของคุณถูกระงับการใช้งาน' }); 
        }

        await client.query(`INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`, [USER_ID, 'LOGIN_SUCCESS', clientIp, 'SUCCESS']);

        return res.json({
            status: 'success',
            user: { id: USER_ID, name: user.username, dept: user.department },
            session: { ip: clientIp, loginTime }
        });

    } catch (err) {
        // ถ้าฐานข้อมูลมีปัญหา จะเด้งมาที่นี่แทนการพัง
        console.error("Database Error:", err);
        return res.status(500).json({ status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้: ' + err.message });
    } finally {
        if (client) client.release(); // คืนการเชื่อมต่อให้ระบบ
    }
});

// --- Logs API ---
app.get('/all-logs', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const sql = `SELECT l.log_id, l.user_id, u.username, l.action, l.client_ip, l.status,
                            to_char(l.log_time, 'DD/MM/YYYY HH24:MI') AS formatted_time
                     FROM log_activity l
                     LEFT JOIN users u ON l.user_id = u.user_id
                     ORDER BY l.log_time DESC`;
                     
        const result = await client.query(sql);

        const logs = result.rows.map(row => {
            return {
                LOG_ID: row.log_id,
                USER_ID: row.user_id,
                USERNAME: row.username || 'Unknown',
                ACTION: row.action,
                CLIENT_IP: row.client_ip,
                STATUS: row.status,
                LOG_TIME: row.formatted_time
            };
        });

        return res.status(200).json(logs);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
    }
});

// --- API Change Status User ---
app.put('/update-status/:id', async (req, res) => {
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

// --- API Delete Log ---
app.delete('/delete-log/:id', async (req, res) => {
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

// --- API All Users ---
app.get('/all-users', async (req, res) => {
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

const PORT = process.env.API_BASE_URL || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;