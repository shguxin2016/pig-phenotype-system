import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { UserEntity } from '../db/entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';

describe('AdminController', () => {
  let app: INestApplication;
  let userRepo: Repository<UserEntity>;

  const buildApp = async () => {
    process.env.DB_TYPE = 'sqljs';
    process.env.DB_SQLJS_PATH = `data/test-${Date.now()}-${Math.random()}.sqlite`;
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_INIT_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    userRepo = moduleRef.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  it('allows admin to create and update a unit user', async () => {
    await buildApp();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: 'admin',
        unitName: '上海市动物疫病预防控制中心',
        password: 'test-password',
      });

    expect(loginRes.status).toBe(201);
    const token = loginRes.body.accessToken;

    const unitsRes = await request(app.getHttpServer())
      .get('/admin/units')
      .set('Authorization', `Bearer ${token}`);

    expect(unitsRes.status).toBe(200);
    const targetUnit = unitsRes.body.find(
      (u: any) => u.name === '上海市种畜禽测定中心',
    );
    expect(targetUnit).toBeTruthy();

    const createRes = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ unitId: targetUnit.id, username: 'center' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.initialPassword).toBeTruthy();

    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/users/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'center2', isActive: false });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.username).toBe('center2');
    expect(updateRes.body.isActive).toBe(false);
  });

  it('denies non-admin access', async () => {
    await buildApp();

    const unitsRes = await request(app.getHttpServer()).get('/admin/units');
    expect(unitsRes.status).toBe(401);

    const farmUnitId = 1;
    await userRepo.save(
      userRepo.create({
        username: 'farm',
        unitId: farmUnitId,
        role: '保种场',
        passwordHash: await hashPassword('farm-pass'),
        isActive: true,
      }),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: 'farm',
        unitName: '上海市嘉定区动物疫病预防控制中心',
        password: 'farm-pass',
      });

    expect(loginRes.status).toBe(201);
    const token = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/admin/units')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
