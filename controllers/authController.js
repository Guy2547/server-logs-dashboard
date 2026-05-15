const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body.USER_ID, req.body.PASSWORD, req);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { login };