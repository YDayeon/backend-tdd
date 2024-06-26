module.exports = function ValidationException(error) {
  this.status = 400;
  this.message = 'validation_failure';
  this.errors = error;
};
