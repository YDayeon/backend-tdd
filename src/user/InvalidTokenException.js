module.exports = function InvalidTokenException() {
  this.message = 'invalid_token';
  this.status = 400;
};
