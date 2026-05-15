const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const message = err.message || 'Server Error';

  console.error('❌ Error:', err);
  return res.status(status).json({ status: 'error', message });
};

module.exports = errorHandler;