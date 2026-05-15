const pool = require('../config/db');

const queryLogs = async ({ search, date, status }) => {
  let query = `
    SELECT
       log_id AS "id",
      user_id AS "USER_ID",
      username AS "USERNAME",
      action AS "ACTION",
      client_ip AS "CLIENT_IP",
      status AS "STATUS",
      TO_CHAR(log_time, 'YYYY-MM-DD HH24:MI:SS') AS "LOG_TIME"
    FROM log_activity
    WHERE 1=1
  `;
  const values = [];
  let valueIndex = 1;

  if (search) {
    query += ` AND (CAST(user_id AS TEXT) ILIKE $${valueIndex} OR username ILIKE $${valueIndex})`;
    values.push(`%${search}%`);
    valueIndex++;
  }

  if (date) {
    query += ` AND DATE(log_time) = $${valueIndex}`;
    values.push(date);
    valueIndex++;
  }

  if (status) {
    query += ` AND status = $${valueIndex}`;
    values.push(status);
    valueIndex++;
  }

  query += ' ORDER BY log_time DESC';
  const result = await pool.query(query, values);
  return result.rows;
};

const insertLoginLog = async (userId, username, action, clientIp, status) => {
  await pool.query(
    'INSERT INTO log_activity (user_id,username,action,client_ip,status,log_time) VALUES ($1,$2,$3,$4,$5,NOW())',
    [userId, username, action, clientIp, status]
  );
};

module.exports = { queryLogs, insertLoginLog };