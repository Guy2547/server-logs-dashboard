const logService = require('../services/logService');

const getLogs = async (req, res, next) => {
  try {
    const { search, date, status } = req.query;
    const rows = await logService.queryLogs({ search, date, status });
    return res.status(200).json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { getLogs };