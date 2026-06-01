import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { UserEntity } from '../db/entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';

describe('MeatqController', () => {
  let app: INestApplication;
  let userRepo: Repository<UserEntity>;

  const startApp = async () => {
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

  const login = async (
    username: string,
    unitName: string,
    password: string,
  ) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, unitName, password });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  };

  it('produces NYT821 warnings', async () => {
    await startApp();
    const token = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );

    const pigRes = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 1,
        breedId: 1,
        individualNo: 'M1',
        earTagNo: 'M-E001',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(pigRes.status).toBe(201);
    const pigId = pigRes.body.id;

    const getEmpty = await request(app.getHttpServer())
      .get(`/pigs/${pigId}/meatq`)
      .set('Authorization', `Bearer ${token}`);
    expect(getEmpty.status).toBe(200);
    expect(getEmpty.body).toBe(null);

    const up = await request(app.getHttpServer())
      .put(`/pigs/${pigId}/meatq`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        colorL: 61,
        ph1h: 5.8,
        ph24h: 5.5,
        dripLossPct: 6,
        marblingScore: 3,
      });
    expect(up.status).toBe(200);
    expect(up.body.warnings.join(' ')).toContain('PSE');
    expect(up.body.warnings.join(' ')).toContain('滴水损失');

    const getAfter = await request(app.getHttpServer())
      .get(`/pigs/${pigId}/meatq`)
      .set('Authorization', `Bearer ${token}`);
    expect(getAfter.status).toBe(200);
    expect(getAfter.body.record.id).toBe(up.body.record.id);
    expect(getAfter.body.warnings.join(' ')).toContain('PSE');
  });

  it('enforces strong validation', async () => {
    await startApp();
    const token = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );

    const pigRes = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 1,
        breedId: 1,
        individualNo: 'M2',
        earTagNo: 'M-E002',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(pigRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .put(`/pigs/${pigRes.body.id}/meatq`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dripLossPct: 120 });
    expect(res.status).toBe(400);
  });

  it('scopes farm user to its unit', async () => {
    await startApp();
    await userRepo.save(
      userRepo.create({
        username: 'farm',
        unitId: 1,
        role: '保种场',
        passwordHash: await hashPassword('farm-pass'),
        isActive: true,
      }),
    );
    const token = await login(
      'farm',
      '上海市嘉定区动物疫病预防控制中心',
      'farm-pass',
    );

    const adminToken = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );
    const pig = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        unitId: 2,
        breedId: 1,
        individualNo: 'M3',
        earTagNo: 'M-E003',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(pig.status).toBe(201);

    const res = await request(app.getHttpServer())
      .put(`/pigs/${pig.body.id}/meatq`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dripLossPct: 3 });
    expect(res.status).toBe(403);
  });
});
