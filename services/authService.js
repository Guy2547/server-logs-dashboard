const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const logService = require('./logService');

const JWT_SECRET = process.env.JWT_SECRET || 'data707-super-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.socket?.remoteAddress || req.ip || '127.0.0.1';
};

const logUnknownUser = (userId, clientIp) => {
  const logFilePath = path.join(__dirname, '../logs/unauthorized_access.log');
  const timestamp = new Date().toLocaleString('th-TH');
  fs.appendFile(logFilePath,
    `[${timestamp}] ID: ${userId} | IP: ${clientIp} | Status: NOT_FOUND_IN_DB\n`,
    (err) => { if (err) console.error('📝 บันทึกล้มเหลว:', err); }
  );
};

const loginUser = async (USER_ID, PASSWORD, req) => {
  const userId = String(USER_ID || '').trim();
  if (!userId || isNaN(userId)) {
    throw createHttpError(400, 'USER ID ต้องเป็นตัวเลขเท่านั้น');
  }

  let client;
  try {
    client = await pool.connect();
    const clientIp = getClientIp(req);

    const { rows } = await client.query(`
      SELECT u.username, u.first_name, u.last_name, u.password, u.status,
        ARRAY_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL) AS department
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE u.user_id = $1
      GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.password, u.status
    `, [userId]);

    if (rows.length === 0) {
      logUnknownUser(userId, clientIp);
      await logService.insertLoginLog(userId, '-', 'LOGIN_FAILED', clientIp, 'NOT_FOUND');
      if (req.app.get('io')) req.app.get('io').emit('new-log');
      throw createHttpError(404, 'ไอดีคุณไม่มีในฐานข้อมูล');
    }

    const user = rows[0];
    const displayName = user.first_name || user.username;
    const isMatch = await bcrypt.compare(PASSWORD, user.password);

    if (!isMatch) {
      await logService.insertLoginLog(userId, displayName, 'LOGIN_FAILED', clientIp, 'WRONG_PASSWORD');
      if (req.app.get('io')) req.app.get('io').emit('new-log');
      throw createHttpError(401, 'รหัสผ่านไม่ถูกต้อง');
    }

    if (user.status !== 'ACTIVE') {
      await logService.insertLoginLog(userId, displayName, 'LOGIN_FAILED', clientIp, 'DEACTIVATED');
      if (req.app.get('io')) req.app.get('io').emit('new-log');
      throw createHttpError(403, 'บัญชีของคุณถูกระงับการใช้งาน');
    }

    const userRoles = user.department || [];
    const tokenId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `login-${userId}-${Date.now()}`;

    const token = jwt.sign(
      {
        userId,
        name: displayName,
        roles: userRoles,
        ip: clientIp,
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES,
        jwtid: tokenId,
      }
    );

    await logService.insertLoginLog(userId, displayName, 'LOGIN_SUCCESS', clientIp, 'SUCCESS');
    if (req.app.get('io')) req.app.get('io').emit('new-log');

    return {
      status: 'success',
      token,
      user: {
        id: userId,
        name: displayName,
        dept: userRoles,
      },
    };
  } catch (err) {
    if (err.status) throw err;
    throw createHttpError(500, err.message);
  } finally {
    if (client) client.release();
  }
};

module.exports = { loginUser };