const userService = require('../services/userService');

const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    return res.json(users);
  } catch (err) {
    next(err);
  }
};

const getRoles = async (req, res, next) => {
  try {
    const roles = await userService.getRoles();
    return res.json(roles);
  } catch (err) {
    next(err);
  }
};

const addUser = async (req, res, next) => {
  try {
    const { userId, firstName, lastName, password, roleId } = req.body;
    await userService.createUser({ userId, firstName, lastName, password, roleId });
    return res.status(201).json({ status: 'success', message: 'เพิ่มพนักงานเรียบร้อย' });
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, roleId, role_id, dept } = req.body;
    await userService.updateUser(userId, { firstName, lastName, roleId, role_id, dept });
    return res.json({ status: 'success', message: 'แก้ไขข้อมูลเรียบร้อย' });
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    await userService.updateStatus(userId, status);
    return res.json({ status: 'success', message: 'อัปเดตสถานะเรียบร้อย' });
  } catch (err) {
    next(err);
  }
};

const verifyIdentity = async (req, res, next) => {
  try {
    const { userId, birthdate } = req.body;
    await userService.verifyIdentity(userId, birthdate);
    return res.json({ status: 'success', message: 'ยืนยันตัวตนสำเร็จ' });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { userId, newPassword } = req.body;
    await userService.resetPassword(userId, newPassword);
    return res.json({ status: 'success', message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllUsers,
  getRoles,
  addUser,
  updateUser,
  updateStatus,
  verifyIdentity,
  resetPassword,
};