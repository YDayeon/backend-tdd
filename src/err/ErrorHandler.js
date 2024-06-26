// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const timestamp = new Date().getTime();
  const { message, status, errors } = err;
  let validationErrors;
  if (errors) {
    validationErrors = {};
    errors.array().forEach((error) => (validationErrors[error.param] = req.t(error.msg)));
  }
  res.status(status).send({
    path: req.originalUrl,
    timestamp,
    message: req.t(message),
    validationErrors,
  });
};
