const app = require('./app');

if (process.env.NODE_ENV !== 'test') {
  const port = app.locals.port || 3000;
  app.listen(port, () => console.log(`🚀 ${app.locals.env || 'development'} Server running on port ${port}`));
}

