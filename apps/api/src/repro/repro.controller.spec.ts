import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('ReproController', () => {
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

  it('shares litter between pigs and detects conflict', async () => {
    await startApp();
    const token = await loginAdmin();

    const pig1 = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 1,
        breedId: 1,
        individualNo: 'A1',
        earTagNo: 'R-E1',
        sex: '母',
        birthDate: '2026-01-01',
        damEarTagNo: 'D-001',
      });
    expect(pig1.status).toBe(201);

    const pig2 = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 1,
        breedId: 1,
        individualNo: 'A2',
        earTagNo: 'R-E2',
        sex: '母',
        birthDate: '2026-01-02',
        damEarTagNo: 'D-001',
      });
    expect(pig2.status).toBe(201);

    const up1 = await request(app.getHttpServer())
      .put(`/pigs/${pig1.body.id}/repro`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        litter: {
          damEarTagNo: 'D-001',
          farrowingDate: '2026-02-01',
          maleBorn: 5,
          femaleBorn: 5,
          stillbornCount: 0,
          mummyCount: 0,
          malformedCount: 0,
          weakCount: 1,
        },
        piglet: { birthWeightKg: 1.2, leftTeats: 7, rightTeats: 7 },
      });
    expect(up1.status).toBe(200);

    const up2 = await request(app.getHttpServer())
      .put(`/pigs/${pig2.body.id}/repro`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        litter: {
          damEarTagNo: 'D-001',
          farrowingDate: '2026-02-01',
          maleBorn: 5,
          femaleBorn: 5,
          stillbornCount: 0,
          mummyCount: 0,
          malformedCount: 0,
          weakCount: 1,
        },
        piglet: { birthWeightKg: 1.1, leftTeats: 6, rightTeats: 7 },
      });
    expect(up2.status).toBe(200);
    expect(up2.body.litter.id).toBe(up1.body.litter.id);

    const conflict = await request(app.getHttpServer())
      .put(`/pigs/${pig2.body.id}/repro`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        litter: {
          damEarTagNo: 'D-001',
          farrowingDate: '2026-02-01',
          maleBorn: 6,
          femaleBorn: 5,
          stillbornCount: 0,
          mummyCount: 0,
          malformedCount: 0,
          weakCount: 1,
        },
        piglet: { birthWeightKg: 1.1 },
      });
    expect(conflict.status).toBe(409);
  });
});
