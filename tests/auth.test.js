const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/constants');

describe('Authentication & Authorization Suite', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new Super Admin user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'adminuser',
          email: 'admin@test.com',
          password: 'Password123!',
          fullName: 'Test Admin',
          role: ROLES.SUPER_ADMIN
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('admin@test.com');
      expect(res.body.data.user.role).toBe(ROLES.SUPER_ADMIN);
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.token).toBeDefined();
    });

    it('should prevent duplicate email registration', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'user1',
          email: 'duplicate@test.com',
          password: 'Password123!'
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'user2',
          email: 'duplicate@test.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Email is already registered');
    });

    it('should reject invalid password format (< 6 characters)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'shortpass',
          email: 'short@test.com',
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'loginuser',
          email: 'login@test.com',
          password: 'Password123!',
          role: ROLES.MATCH_OPERATOR
        });
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe(ROLES.MATCH_OPERATOR);
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'WrongPassword!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid email or password');
    });
  });

  describe('Protected Profile & Role Middleware', () => {
    let adminToken;
    let operatorToken;
    let publicToken;

    beforeEach(async () => {
      const adminRes = await request(app).post('/api/auth/register').send({
        username: 'admin1',
        email: 'admin1@test.com',
        password: 'Password123!',
        role: ROLES.SUPER_ADMIN
      });
      adminToken = adminRes.body.data.token;

      const opRes = await request(app).post('/api/auth/register').send({
        username: 'operator1',
        email: 'op1@test.com',
        password: 'Password123!',
        role: ROLES.MATCH_OPERATOR
      });
      operatorToken = opRes.body.data.token;

      const pubRes = await request(app).post('/api/auth/register').send({
        username: 'public1',
        email: 'pub1@test.com',
        password: 'Password123!',
        role: ROLES.PUBLIC_USER
      });
      publicToken = pubRes.body.data.token;
    });

    it('should fetch own profile using /api/auth/me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('admin1');
    });

    it('should reject /api/auth/me without authorization header', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should forbid Public User from creating tournaments (Super Admin only)', async () => {
      const res = await request(app)
        .post('/api/tournaments')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({
          name: 'Unauthorized Tournament',
          startDate: '2026-11-20',
          endDate: '2026-11-30'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid Match Operator from creating tournaments', async () => {
      const res = await request(app)
        .post('/api/tournaments')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Unauthorized Tournament 2',
          startDate: '2026-11-20',
          endDate: '2026-11-30'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
