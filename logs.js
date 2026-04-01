const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const dbConfig = {
    user: 'Serverlogs',
    password: '0987',
    connectString: 'host.docker.internal:1521/XE'
};

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

// --- Login API ---
app.post('/login', async (req, res) => {
    const { USER_ID, PASSWORD } = req.body;
    let connection;
    const clientIp = getClientIp(req);
    const loginTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    try {
        connection = await oracledb.getConnection(dbConfig);

        const authSql = `SELECT USERNAME, DEPARTMENT FROM USERS
                         WHERE USER_ID = :id AND PASSWORD = :pw AND STATUS = 'ACTIVE'`;
        const authResult = await connection.execute(authSql, { id: USER_ID, pw: PASSWORD });

        if (authResult.rows.length > 0) {
            const [username, dept] = authResult.rows[0];
            
            // แก้ไข: เอา USERNAME และ PASSWORD ออกจากการ INSERT
            await connection.execute(
                `INSERT INTO LOG_ACTIVITY (USER_ID, ACTION, CLIENT_IP, STATUS, LOG_TIME)
                 VALUES (:id, :action, :ip, :status, SYSTIMESTAMP)`,
                {
                    id: USER_ID,
                    action: 'LOGIN_SUCCESS',
                    ip: clientIp,
                    status: 'SUCCESS'
                },
                { autoCommit: true }
            );

            return res.json({
                status: 'success',
                user: { id: USER_ID, name: username, dept: dept },
                session: { ip: clientIp, loginTime }
            });
        }

        const idResult = await connection.execute(
            `SELECT USERNAME FROM USERS WHERE USER_ID = :id`,
            { id: USER_ID }
        );
        // แก้ไข: เอา USERNAME และ PASSWORD ออกจากการ INSERT กรณีล็อคอินผิดพลาดเช่นกัน
        await connection.execute(
            `INSERT INTO LOG_ACTIVITY (USER_ID, ACTION, CLIENT_IP, STATUS, LOG_TIME)
             VALUES (:id, :action, :ip, :status, SYSTIMESTAMP)`,
            {
                id: USER_ID,
                action: 'LOGIN_FAILED',
                ip: clientIp,
                status: idResult.rows.length > 0 ? 'FAIL' : 'NOT_FOUND'
            },
            { autoCommit: true }
        );

        if (idResult.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'ไอดีคุณไม่มีในฐานข้อมูล' });
        }

        return res.status(401).json({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});
// --- Logs API ---
app.get('/all-logs', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);

        // แก้ไข: ใช้ JOIN ดึง USERNAME มาจากตาราง USERS
        const sql = `SELECT L.LOG_ID, L.USER_ID, U.USERNAME, L.ACTION, L.CLIENT_IP, L.STATUS,
                            TO_CHAR(L.LOG_TIME, 'DD/MM/YYYY HH24:MI') AS LOG_TIME
                     FROM LOG_ACTIVITY L
                     LEFT JOIN USERS U ON L.USER_ID = U.USER_ID
                     ORDER BY L.LOG_TIME DESC`;
                     
        const result = await connection.execute(sql);
        // เพื่อให้ Frontend สามารถเข้าถึง data.USERNAME ได้ตรงๆ
        const logs = result.rows.map(row => {
            return {
                LOG_ID: row[0],
                USER_ID: row[1],
                USERNAME: row[2] || 'Unknown', // ถ้าไม่มีชื่อให้ขึ้น Unknown
                ACTION: row[3],
                CLIENT_IP: row[4],
                STATUS: row[5],
                LOG_TIME: row[6]
            };
        });

        return res.status(200).json(logs);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

app.delete('/delete-log/:id', async (req, res) => {
    const logId = req.params.id;
    const { dept } = req.body;
    let connection;

    if (dept !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'เฉพาะ Admin เท่านั้นที่มีสิทธิ์ลบ' });
    }

    try {
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            `DELETE FROM LOG_ACTIVITY WHERE LOG_ID = :id`,
            { id: logId },
            { autoCommit: true }
        );

        if (result.rowsAffected > 0) {
            return res.json({ status: 'success', message: 'ลบข้อมูลสำเร็จ' });
        }

        return res.status(404).json({ status: 'error', message: 'ไม่พบข้อมูลที่ต้องการลบ' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

app.post('/logs', async (req, res) => {
    const { USERID, ACTION, STATUS } = req.body;
    let connection;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '127.0.0.1';

    try {
        connection = await oracledb.getConnection(dbConfig);

        const sql = `INSERT INTO LOG_ACTIVITY (USER_ID, ACTION, STATUS, CLIENT_IP, LOG_TIME)
                     VALUES (:id, :action, :status, :ip, SYSDATE)`;
        const result = await connection.execute(
            sql,
            { id: USERID, action: ACTION, status: STATUS, ip: clientIp },
            { autoCommit: true }
        );

        return res.status(201).json({
            status: 'success',
            message: 'บันทึกข้อมูล Log เรียบร้อยแล้ว',
            rowsInserted: result.rowsAffected
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

//-USER-
app.get('/all-users', async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        // ดึงแค่ USER_ID, NAME,DEPARTMENT
        const sql = `SELECT USER_ID, USERNAME, DEPARTMENT FROM USERS ORDER BY USER_ID`;
        const result = await connection.execute(sql);

        return res.status(200).json(result.rows);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});
    function loadLogs() {
    // เปิดหน้าจอหมุนๆ โหลดข้อมูล
    document.getElementById('loadingOverlay').style.display = 'flex'; 

    axios.get('http://localhost:3000/all-logs')
        .then(res => {
            // ข้อมูลมาแล้ว ปิดหน้าจอหมุนๆ
            document.getElementById('loadingOverlay').style.display = 'none'; 
            
            // ...
        })
        .catch(err => {
            // ถ้า Error ก็ต้องปิดหน้าจอหมุนๆ เหมือนกัน
            document.getElementById('loadingOverlay').style.display = 'none'; 
            console.error('Axios Error:', err);
        });
}
if (process.env.NODE_ENV !== 'test') {
    app.listen(3000, () => console.log('🚀 Server running on port 3000'));
}

module.exports = app;
