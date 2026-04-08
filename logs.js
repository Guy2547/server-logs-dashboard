const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();
const app = express();

// CORS
app.use(cors({
    origin: '*', // ยอมรับทุกหน้าเว็บ
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

//   (Rate Limit)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { status: 'error', message: 'คุณพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
    standardHeaders: true, 
    legacyHeaders: false,
});
app.use(limiter);


const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 22941,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true'
});

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

// --- Login API ---
app.post('/login', async (req, res) => {
    const { USER_ID, PASSWORD } = req.body;
    const client = await pool.connect();
    const clientIp = getClientIp(req);
    const loginTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    if (!USER_ID || isNaN(USER_ID)) {
        client.release();
        return res.status(400).json({ status: 'error', message: 'USER ID ต้องเป็นตัวเลขเท่านั้น' });
    }

    try {
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
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
});

// --- Logs API ---
app.get('/all-logs', async (req, res) => {
    const client = await pool.connect();
    try {
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
        client.release();
    }
});

// --- API Change Status User ---
app.put('/update-status/:id', async (req, res) => {
    const userId = req.params.id;
    const { status, dept } = req.body;
    const client = await pool.connect();

    if (dept !== 'admin' && dept !== 'hr') {
        client.release();
        return res.status(403).json({ status: 'error', message: 'ไม่มีสิทธิ์ใช้งาน' });
    }

    try {
        await client.query(`UPDATE users SET status = $1 WHERE user_id = $2`, [status, userId]);
        return res.json({ status: 'success', message: 'เปลี่ยนสถานะสำเร็จ' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
});

// --- API Delete Log ---
app.delete('/delete-log/:id', async (req, res) => {
    const logId = req.params.id;
    const { dept } = req.body;
    const client = await pool.connect();

    if (dept !== 'admin') {
        client.release();
        return res.status(403).json({ status: 'error', message: 'เฉพาะ Admin เท่านั้นที่มีสิทธิ์ลบ' });
    }

    try {
        const result = await client.query(`DELETE FROM log_activity WHERE log_id = $1`, [logId]);

        if (result.rowCount > 0) {
            return res.json({ status: 'success', message: 'ลบข้อมูลสำเร็จ' });
        }

        return res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูลที่ต้องการลบ' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
});

// --- API All Users ---
app.get('/all-users', async (req, res) => {
    const client = await pool.connect();

    try {
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
        client.release();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;