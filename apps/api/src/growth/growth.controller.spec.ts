import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('GrowthController', () => {
  let app: INestApplication;

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
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  const loginAdmin = async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      username: 'admin',
      unitName: '上海市动物疫病预防控制中心',
      password: 'test-password',
    });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  };

  it('computes derived fields including DTSW', async () => {
    await startApp();
    const token = await loginAdmin();

    const pigRes = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 1,
        breedId: 5,
        individualNo: 'SW-1',
        earTagNo: 'SW-E001',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(pigRes.status).toBe(201);
    const pigId = pigRes.body.id;

    const upsert = await request(app.getHttpServer())
      .put(`/pigs/${pigId}/growth`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startDate: '2026-01-31',
        startWeightKg: 25,
        endDate: '2026-03-01',
        endWeightKg: 90,
        feedKg: 100,
      });

    expect(upsert.status).toBe(200);
    expect(upsert.body.testDays).toBe(29);
    expect(upsert.body.startAgeDays).toBe(30);
    expect(upsert.body.endAgeDays).toBe(59);
    expect(upsert.body.dtswDays).toBe(59);
    expect(upsert.body.adgG).toBeGreaterThan(2000);
  });
});
