const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const app = require('./backend/app');
dotenv.config();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { status: 'error', message: 'คุณพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
    standardHeaders: true, 
    legacyHeaders: false,
});

// Environment-specific configuration
const config = {
  development: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    database: {
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === 'true',
      max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : undefined,
      idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT_MS ? parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) : undefined
    }
  }
};

const env = process.env.NODE_ENV || 'development';
const currentConfig = config[env] || config['development'];

const pool = new Pool(currentConfig.database);

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
}


// --- Login API ---
app.post('/login', limiter, async (req, res) => {
    const { USER_ID, PASSWORD } = req.body;
    const client = await pool.connect();
    const clientIp = getClientIp(req);
    const loginTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    //login csae
    if (isNaN(USER_ID)) {
        client.release();
        return res.status(400).json({ status: 'error', message: 'USER ID ต้องเป็นตัวเลขเท่านั้น' });
    }
try {
        
        const userResult = await client.query(
            `SELECT username, department, password, status FROM users WHERE user_id = $1`, 
            [USER_ID]
        );

        // ไม่มีไอดีนี้ในระบบ
        if (userResult.rows.length === 0) {
            await client.query(`INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`, [USER_ID, 'LOGIN_FAILED', clientIp, 'NOT_FOUND']);
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        const user = userResult.rows[0];

        // รหัสผ่านไม่ถูกต้อง
        if (user.password !== PASSWORD) {
            await client.query(`INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`, [USER_ID, 'LOGIN_FAILED', clientIp, 'WRONG_PASSWORD']);
            return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // เช็คสถานะบัญชี (ถ้าไม่ใช่ ACTIVE ให้เด้งออก)
        if (user.status !== 'ACTIVE') {
            await client.query(`INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`, [USER_ID, 'LOGIN_FAILED', clientIp, 'DEACTIVATED']);
            return res.status(403).json({ status: 'error', message: 'บัญชีของคุณถูกระงับการใช้งาน' }); 
        }

        // (Login Success)
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

    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (clientIp && !ipRegex.test(clientIp) && clientIp !== '::1') {
        client.release();
        return res.status(400).json({ message: 'รูปแบบ IP Address ไม่ถูกต้อง' });
    }

    try {
        
        const authSql = `SELECT username, department FROM users WHERE user_id = $1 AND password = $2 AND status = 'ACTIVE'`;
        const authResult = await client.query(authSql, [USER_ID, PASSWORD]);

        if (authResult.rows.length > 0) {
            const { username, department } = authResult.rows[0];
            
            
            await client.query(
                `INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`,
                [USER_ID, 'LOGIN_SUCCESS', clientIp, 'SUCCESS']
            );

            return res.json({
                status: 'success',
                user: { id: USER_ID, name: username, dept: department },
                session: { ip: clientIp, loginTime }
            });
        }

        const idResult = await client.query(`SELECT username FROM users WHERE user_id = $1`, [USER_ID]);
        
        await client.query(
            `INSERT INTO log_activity (user_id, action, client_ip, status, log_time) VALUES ($1, $2, $3, $4, NOW())`,
            [USER_ID, 'LOGIN_FAILED', clientIp, idResult.rows.length > 0 ? 'FAIL' : 'NOT_FOUND']
        );

        if (idResult.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
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
        // แก้ไข SQL เป็นตัวพิมพ์เล็กให้ตรงกับ Database
        const sql = `SELECT l.log_id, l.user_id, u.username, l.action, l.client_ip, l.status,
                            to_char(l.log_time, 'DD/MM/YYYY HH24:MI') AS formatted_time
                     FROM log_activity l
                     LEFT JOIN users u ON l.user_id = u.user_id
                     ORDER BY l.log_time DESC`;
                     
        const result = await client.query(sql);


        
        // แปลงกลับเป็นตัวพิมพ์ใหญ่ เพื่อให้หน้าเว็บ dashboard.html ดึงไปใช้ได้ (หน้าเว็บรอรับตัวพิมพ์ใหญ่อยู่)
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
    // --- API for changing status User ---
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

app.delete('/delete-log/:id', async (req, res) => {
    const logId = req.params.id;
    const { dept } = req.body;
    const client = await pool.connect();

    if (dept !== 'admin') {
        client.release();
        return res.status(403).json({ status: 'error', message: 'เฉพาะ Admin เท่านั้นที่มีสิทธิ์ลบ' });
    }

    try {
        // แก้ไข SQL เป็นตัวพิมพ์เล็กให้ตรงกับ Database
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

//-USER-
app.get('/all-users', async (req, res) => {
    const client = await pool.connect();

    try {
        // แก้ไข SQL เป็นตัวพิมพ์เล็กให้ตรงกับ Database
        const sql = `SELECT user_id, username, department FROM users ORDER BY user_id`;
        const result = await client.query(sql);

        // แปลงกลับเป็นตัวพิมพ์ใหญ่ เพื่อให้หน้าเว็บรับข้อมูลไปแสดงในตารางได้
        const users = result.rows.map(row => ({
            USER_ID: row.user_id,
            USERNAME: row.username,
            DEPARTMENT: row.department
        }));

        return res.status(200).json(users);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
});

if (env !== 'test') {
    app.listen(currentConfig.port, () => console.log(`🚀 ${env} Server running on port ${currentConfig.port}`));
}

module.exports = app;