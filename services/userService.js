const pool = require('../config/db');
const bcrypt = require('bcrypt');

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const normalizeRoleIds = (value) => {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value;
  return [value];
};

const getAllUsers = async () => {
  const { rows } = await pool.query(`
    SELECT u.user_id, u.first_name, u.last_name, u.username, u.status,
      ARRAY_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL) AS department
    FROM users u
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.role_id
    GROUP BY u.user_id, u.first_name, u.last_name, u.username, u.status
    ORDER BY u.user_id
  `);

  return rows.map((row) => ({
    USER_ID: row.user_id,
    FIRST_NAME: row.first_name || '',
    LAST_NAME: row.last_name || '',
    USERNAME: row.username,
    STATUS: row.status,
    DEPARTMENT: row.department || [],
  }));
};

const getRoles = async () => {
  const { rows } = await pool.query('SELECT role_id, role_name FROM roles ORDER BY role_id');
  return rows;
};

const createUser = async ({ userId, firstName, lastName, password, roleId }) => {
  if (!userId || !firstName || !lastName || !password || !roleId) {
    throw createHttpError(400, 'กรุณาระบุข้อมูลให้ครบ');
  }

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
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw createHttpError(409, 'userId นี้มีในระบบแล้ว');
    }
    throw err.status ? err : createHttpError(500, err.message);
  } finally {
    if (client) client.release();
  }
};

const updateUser = async (userId, { firstName, lastName, roleId, role_id, dept }) => {
  if (!firstName || !lastName) {
    throw createHttpError(400, 'กรุณาระบุ firstName และ lastName');
  }

  let roleIds = normalizeRoleIds(roleId) || normalizeRoleIds(role_id) || normalizeRoleIds(dept);
  if (roleIds !== undefined) {
    roleIds = roleIds.map((r) => Number(r)).filter((r) => !Number.isNaN(r));
  }

  const username = `${firstName} ${lastName}`.trim();
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const updateResult = await client.query(
      'UPDATE users SET first_name=$1, last_name=$2, username=$3 WHERE user_id=$4',
      [firstName, lastName, username, userId]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      throw createHttpError(404, 'ไม่พบ user นี้');
    }

    if (roleIds !== undefined) {
      await client.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
      for (const rId of roleIds) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [userId, rId]);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err.status ? err : createHttpError(500, err.message);
  } finally {
    if (client) client.release();
  }
};

const updateStatus = async (userId, status) => {
  if (!['ACTIVE', 'DEACTIVATED'].includes(status)) {
    throw createHttpError(400, 'สถานะไม่ถูกต้อง');
  }

  const result = await pool.query('UPDATE users SET status=$1 WHERE user_id=$2', [status, userId]);
  if (result.rowCount === 0) {
    throw createHttpError(404, 'ไม่พบ user นี้');
  }
};

const verifyIdentity = async (userId, birthdate) => {
  if (!userId || !birthdate) {
    throw createHttpError(400, 'กรุณาระบุข้อมูลให้ครบ');
  }

  const { rows } = await pool.query('SELECT user_id FROM users WHERE user_id=$1 AND birthdate=$2', [userId, birthdate]);
  if (rows.length === 0) {
    throw createHttpError(404, 'ไม่พบข้อมูล หรือวันเกิดไม่ตรง');
  }
};

const resetPassword = async (userId, newPassword) => {
  if (!userId || !newPassword) {
    throw createHttpError(400, 'กรุณาระบุข้อมูลให้ครบ');
  }

  const hashed = await bcrypt.hash(String(newPassword), 10);
  const result = await pool.query('UPDATE users SET password=$1 WHERE user_id=$2', [hashed, userId]);
  if (result.rowCount === 0) {
    throw createHttpError(404, 'ไม่พบ user นี้');
  }
};

module.exports = {
  getAllUsers,
  getRoles,
  createUser,
  updateUser,
  updateStatus,
  verifyIdentity,
  resetPassword,
};