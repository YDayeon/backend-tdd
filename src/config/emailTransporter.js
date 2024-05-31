const nodemail = require('nodemailer');
const nodemailStub = require('nodemailer-stub');

const transporter = nodemail.createTransport(nodemailStub.stubTransport);

module.exports = transporter;
