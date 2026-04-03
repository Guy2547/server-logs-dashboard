const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const dotenv = require('dotenv');
dotenv.config();

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
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

    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // Check IP Format (Allowing ::1 for localhost testing)
    if (clientIp && !ipRegex.test(clientIp) && clientIp !== '::1') {
        return res.status(400).json({ message: 'รูปแบบ IP Address ไม่ถูกต้อง' });
    }

    try {
        const authSql = `SELECT USERNAME, DEPARTMENT FROM USERS
                         WHERE USER_ID = $1 AND PASSWORD = $2 AND STATUS = 'ACTIVE'`;
        const authResult = await client.query(authSql, [USER_ID, PASSWORD]);

        if (authResult.rows.length > 0) {
            const { username, department } = authResult.rows[0];
            
            await client.query(
                `INSERT INTO LOG_ACTIVITY (USER_ID, ACTION, CLIENT_IP, STATUS, LOG_TIME)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [USER_ID, 'LOGIN_SUCCESS', clientIp, 'SUCCESS']
            );

            return res.json({
                status: 'success',
                user: { id: USER_ID, name: username, dept: department },
                session: { ip: clientIp, loginTime }
            });
        }

        const idResult = await client.query(
            `SELECT USERNAME FROM USERS WHERE USER_ID = $1`,
            [USER_ID]
        );
        
        await client.query(
            `INSERT INTO LOG_ACTIVITY (USER_ID, ACTION, CLIENT_IP, STATUS, LOG_TIME)
             VALUES ($1, $2, $3, $4, NOW())`,
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
        const sql = `SELECT L.LOG_ID, L.USER_ID, U.USERNAME, L.ACTION, L.CLIENT_IP, L.STATUS,
                            to_char(L.LOG_TIME, 'DD/MM/YYYY HH24:MI') AS LOG_TIME
                     FROM LOG_ACTIVITY L
                     LEFT JOIN USERS U ON L.USER_ID = U.USER_ID
                     ORDER BY L.LOG_TIME DESC`;
                     
        const result = await client.query(sql);
        const logs = result.rows.map(row => {
            return {
                LOG_ID: row.log_id,
                USER_ID: row.user_id,
                USERNAME: row.username || 'Unknown',
                ACTION: row.action,
                CLIENT_IP: row.client_ip,
                STATUS: row.status,
                LOG_TIME: row.log_time
            };
        });

        return res.status(200).json(logs);
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
        return res.status(403).json({ status: 'error', message: 'เฉพาะ Admin เท่านั้นที่มีสิทธิ์ลบ' });
    }

    try {
        const result = await client.query(
            `DELETE FROM LOG_ACTIVITY WHERE LOG_ID = $1`,
            [logId]
        );

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

app.post('/logs', async (req, res) => {
    const { USERID, ACTION, STATUS } = req.body;
    const client = await pool.connect();
    const clientIp = getClientIp(req);

    try {
        const sql = `INSERT INTO LOG_ACTIVITY (USER_ID, ACTION, STATUS, CLIENT_IP, LOG_TIME)
                     VALUES ($1, $2, $3, $4, NOW())`;
        const result = await client.query(
            sql,
            [USERID, ACTION, STATUS, clientIp]
        );

        return res.status(201).json({
            status: 'success',
            message: 'บันทึกข้อมูล Log เรียบร้อยแล้ว',
            rowsInserted: result.rowCount
        });
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
        const sql = `SELECT USER_ID, USERNAME, DEPARTMENT FROM USERS ORDER BY USER_ID`;
        const result = await client.query(sql);

        return res.status(200).json(result.rows);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(3000, () => console.log(`🚀  ${process.env.NODE_ENV} Server running on port 3000`));
}

module.exports = app;
