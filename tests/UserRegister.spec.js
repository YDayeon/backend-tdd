const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');

beforeAll(() => {
  // enroll database
  return sequelize.sync();
});

beforeEach(() => {
  // Cleaning user table
  return User.destroy({ truncate: true });
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

  // it.each([
  //   ['username', 'Username cannot be null'],
  //   ['email', 'E-mail cannot be null'],
  //   ['password', 'Password cannot be null'],
  // ])('when %s is null %s is received', async (field, expectedMessage) => {
  //   const user = {
  //     username: 'user1',
  //     email: 'user1@mail.com',
  //     password: 'P4word',
  //   };
  //   user[field] = null;

  //   const response = await postUser(user);
  //   const body = response.body;

  //   expect(body.validationErrors[field]).toBe(expectedMessage);
  // });

  const username_null = 'Username cannot be null';
  const username_size = 'Must have min 4 and max 32 characters';
  const email_null = 'E-mail cannot be null';
  const email_invalid = 'E-mail is not valid';
  const password_null = 'Password cannot be null';
  const password_size = 'Password must be at least 6 characters';
  const password_pattern = 'Password must have at least 1 uppercase, 1 lowercase and 1 number';
  const email_inuse = 'E-mail in use';

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
});
