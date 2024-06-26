const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
// const nodemailerStub = require('nodemailer-stub');
const SMTPServer = require('smtp-server').SMTPServer;
const EmailService = require('../src/email/EmailService');

let lastMail, server;
let simulateSmtpFailure = false;

beforeAll(async () => {
  // enroll database

  server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
      let mailBody;
      stream.on('data', (data) => {
        mailBody += data.toString();
      });
      stream.on('end', () => {
        if (simulateSmtpFailure) {
          const error = new Error('Invalid mailbox');
          error.responseCode = 553;
          return callback(error);
        }
        lastMail = mailBody;
        callback();
      });
    },
  });

  server.listen(8587, 'localhost');

  return sequelize.sync();
});

beforeEach(() => {
  // Cleaning user table
  simulateSmtpFailure = false;
  return User.destroy({ truncate: true });
});

afterAll(async () => {
  server.close();
});

const validUser = {
  username: 'user1',
  email: 'user1@mail.com',
  password: 'P4ssword',
};

const postUser = (user = validUser, options = {}) => {
  const agent = request(app).post('/api/1.0/users');
  if (options.language) {
    agent.set('Accept-Language', options.language);
  }
  return agent.send(user);
};

describe('User Registration', () => {
  it('return 200 OK when signup request is valid', async () => {
    const response = await postUser();

    expect(response.status).toBe(200);
  });

  it('return success message when request is valid', async () => {
    const response = await postUser();

    expect(response.body.message).toBe('User created');
  });

  it('saves the user to database', async () => {
    await postUser();

    const userList = await User.findAll();

    expect(userList.length).toBe(1);
  });

  it('saves the username and email to database', async () => {
    await postUser();

    const userList = await User.findAll();
    const savedUser = userList[0];

    expect(savedUser.username).toBe('user1');
    expect(savedUser.email).toBe('user1@mail.com');
  });

  it('hashes the password in database', async () => {
    await postUser();

    const userList = await User.findAll();
    const savedUser = userList[0];

    expect(savedUser.password).not.toBe('P4ssword');
  });

  it('returns 400 when username is null', async () => {
    const invalidUser = {
      username: null,
      email: 'user1@mail.com',
      password: 'P4ssword',
    };

    const response = await postUser(invalidUser);

    expect(response.status).toBe(400);
  });

  it('returns validationErrors field in response body when validation error occurs', async () => {
    const invalidUser = {
      username: null,
      email: 'user1@mail.com',
      password: 'P4ssword',
    };

    const response = await postUser(invalidUser);

    expect(response.body.validationErrors).not.toBeUndefined();
  });

  const username_null = 'Username cannot be null';
  const username_size = 'Must have min 4 and max 32 characters';
  const email_null = 'E-mail cannot be null';
  const email_invalid = 'E-mail is not valid';
  const password_null = 'Password cannot be null';
  const password_size = 'Password must be at least 6 characters';
  const password_pattern = 'Password must have at least 1 uppercase, 1 lowercase and 1 number';
  const email_inuse = 'E-mail in use';
  const email_failure = 'E-mail Failure';

  it.each`
    field         | value              | expectedMessage
    ${'username'} | ${null}            | ${username_null}
    ${'username'} | ${'usr'}           | ${username_size}
    ${'username'} | ${'a'.repeat(33)}  | ${username_size}
    ${'email'}    | ${null}            | ${email_null}
    ${'email'}    | ${'mail.com'}      | ${email_invalid}
    ${'email'}    | ${'user.mail.com'} | ${email_invalid}
    ${'email'}    | ${'user@mail'}     | ${email_invalid}
    ${'password'} | ${null}            | ${password_null}
    ${'password'} | ${'P4ssw'}         | ${password_size}
    ${'password'} | ${'alllowercase'}  | ${password_pattern}
    ${'password'} | ${'lower3333'}     | ${password_pattern}
    ${'password'} | ${'ALLUPPERCASE'}  | ${password_pattern}
    ${'password'} | ${'UPPER4444'}     | ${password_pattern}
  `('returns $expectedMessage when $field is $value', async ({ field, value, expectedMessage }) => {
    const user = {
      username: 'user1',
      email: 'user1@mail.com',
      password: 'P4word',
    };
    user[field] = value;

    const response = await postUser(user);
    const body = response.body;

    expect(body.validationErrors[field]).toBe(expectedMessage);
  });

  it(`returns ${email_inuse} when same email is already in use`, async () => {
    await User.create({ ...validUser });
    const response = await postUser();

    expect(response.body.validationErrors.email).toBe(email_inuse);
  });

  it(`returns errors for both username is null and ${email_inuse}`, async () => {
    await User.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: validUser.email,
      password: 'P4ssword',
    });

    expect(Object.keys(response.body.validationErrors)).toEqual(['username', 'email']);
  });

  it('creates user in inactive mode', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.inactive).toBe(true);
  });

  it('creates user in inactive mode even the request body contains inactive', async () => {
    const newUser = { ...validUser, inactive: false };
    await postUser({ ...newUser });
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.activationToken).toBeTruthy();
  });

  it('creates an activationToken for user', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.inactive).toBe(true);
  });

  it('sends an Account activation email with activationToken', async () => {
    await postUser();

    const users = await User.findAll();
    const savedUser = users[0];
    expect(lastMail).toContain('user1@mail.com');
    expect(lastMail).toContain(savedUser.activationToken);
  });

  it('returns 502 Bad Gateway when sending email fails', async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.body.message).toBe(email_failure);
  });

  it('returns Email Failure message when sending email fails', async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.status).toBe(502);
    // mockSendAccountActivation.mockRestore();
  });

  it('does not save user to database if activation email fails', async () => {
    simulateSmtpFailure = true;
    await postUser();
    // mockSendAccountActivation.mockRestore();
    const users = await User.findAll();
    expect(users.length).toBe(0);
  });

  it('return validation failure message in error response body when validation fails', async () => {
    const response = await postUser({
      username: null,
      email: validUser.email,
      password: 'P4ssword',
    });

    expect(response.body.message).toBe('validation failure');
  });
});

describe('Internationalization', () => {
  const username_null = '사용자명은 null이 될 수 없습니다.';
  const username_size = '최소 4자 이상 32자 이하이어야 합니다.';
  const email_null = 'E-mail은 null이 될 수 없습니다.';
  const email_invalid = 'E-mail이 유효하지 않습니다.';
  const password_null = 'Password는 null이 될 수 없습니다.';
  const password_size = 'Password 최소 6자 이상이어야 합니다.';
  const password_pattern = 'Password는 최소한 대문자 1개, 소문자 1개, 숫자 1개를 포함하여야 합니다.';
  const email_inuse = '이미 사용중인 email입니다.';
  const user_create_success = '사용자가 생성되었습니다.';
  const email_failure = '이메일 실패';
  const validation_failure = '유효성 검사 실패';

  it.each`
    field         | value              | expectedMessage
    ${'username'} | ${null}            | ${username_null}
    ${'username'} | ${'usr'}           | ${username_size}
    ${'username'} | ${'a'.repeat(33)}  | ${username_size}
    ${'email'}    | ${null}            | ${email_null}
    ${'email'}    | ${'mail.com'}      | ${email_invalid}
    ${'email'}    | ${'user.mail.com'} | ${email_invalid}
    ${'email'}    | ${'user@mail'}     | ${email_invalid}
    ${'password'} | ${null}            | ${password_null}
    ${'password'} | ${'P4ssw'}         | ${password_size}
    ${'password'} | ${'alllowercase'}  | ${password_pattern}
    ${'password'} | ${'lower3333'}     | ${password_pattern}
    ${'password'} | ${'ALLUPPERCASE'}  | ${password_pattern}
    ${'password'} | ${'UPPER4444'}     | ${password_pattern}
  `(
    'returns $expectedMessage when $field is $value when language is set as Korean',
    async ({ field, value, expectedMessage }) => {
      const user = {
        username: 'user1',
        email: 'user1@mail.com',
        password: 'P4word',
      };
      user[field] = value;

      const response = await postUser(user, { language: 'ko' });
      const body = response.body;

      expect(body.validationErrors[field]).toBe(expectedMessage);
    }
  );

  it(`returns ${email_inuse} when same email is already in use`, async () => {
    await User.create({ ...validUser });
    const response = await postUser({ ...validUser }, { language: 'ko' });

    expect(response.body.validationErrors.email).toBe(email_inuse);
  });

  it(`return success message of ${user_create_success} when request is valid`, async () => {
    const response = await postUser({ ...validUser }, { language: 'ko' });

    expect(response.body.message).toBe(user_create_success);
  });

  it(`returns ${email_failure} message when sending email fails and language is set as Korean`, async () => {
    const mockSendAccountActivation = jest
      .spyOn(EmailService, 'sendAccountActivation')
      .mockRejectedValue({ message: 'Failed to deliver email' });
    const response = await postUser({ ...validUser }, { language: 'ko' });
    mockSendAccountActivation.mockRestore();
    expect(response.body.message).toBe(email_failure);
  });

  it(`return ${validation_failure} failure message in error response body when validation fails`, async () => {
    const invalidUser = {
      username: null,
      email: validUser.email,
      password: 'P4ssword',
    };

    const response = await postUser({ ...invalidUser }, { language: 'ko' });

    expect(response.body.message).toBe(validation_failure);
  });
});

describe('Account activation', () => {
  it('activates the account when correct token is sent', async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();

    expect(users[0].inactive).toBe(false);
  });

  it('removes the token from user table after success activation', async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    users = await User.findAll();

    expect(users[0].activationToken).toBeFalsy();
  });

  it('it does not activate account when token is wrong', async () => {
    await postUser();
    const token = 'this token does not exist';

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    const users = await User.findAll();

    expect(users[0].inactive).toBe(true);
  });

  it('it does not activate account when token is wrong', async () => {
    await postUser();
    const token = 'this token does not exist';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    expect(response.status).toBe(400);
  });

  it.each`
    language | message
    ${'ko'}  | ${'잘못된 토큰 정보입니다.'}
    ${'en'}  | ${'This account is either active or the token is invalid.'}
  `('return this $message when wrong token is sent and language is $language', async ({ language, message }) => {
    await postUser();
    const token = 'this token does not exist';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .set('Accept-Language', language)
      .send();

    expect(response.body.message).toBe(message);
  });
});

describe('Error Model', () => {
  it('returns path, timestamp, message and validationErrors in response when validation failure', async () => {
    const response = await postUser({ ...validUser, username: null });
    const body = response.body;
    console.log(body);
    expect(Object.keys(body)).toEqual(['path', 'timestamp', 'message', 'validationErrors']);
  });

  it('returns path, timestamp and message in response body when request fails other than validation errors', async () => {
    const token = 'this token does not exist';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    const body = response.body;

    expect(Object.keys(body)).toEqual(['path', 'timestamp', 'message']);
  });

  it('returns path in error body', async () => {
    const token = 'this-token-does-not-exist';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    const body = response.body;

    expect(body.path).toEqual('/api/1.0/users/token/' + token);
  });

  it('returns timestamp in milliseconds within 5 seconds value in error body', async () => {
    const nowInMillis = new Date().getTime();
    const fiveSecondsLater = nowInMillis + 5 * 1000;
    const token = 'this-token-does-not-exist';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    const body = response.body;

    expect(body.timestamp).toBeGreaterThan(nowInMillis);
    expect(body.timestamp).toBeLessThan(fiveSecondsLater);
  });
});
