import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { UserEntity } from '../db/entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';

describe('CarcassController', () => {
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

  it('computes NYT825 derived metrics', async () => {
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
        individualNo: 'C1',
        earTagNo: 'C-E001',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(pigRes.status).toBe(201);
    const pigId = pigRes.body.id;

    const up = await request(app.getHttpServer())
      .put(`/pigs/${pigId}/carcass`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        slaughterDate: '2026-06-01',
        preSlaughterWeightKg: 100,
        carcassWeightLeftKg: 38,
        carcassWeightRightKg: 38,
        leftDetachSkinKg: 4,
        leftDetachBoneKg: 5,
        leftDetachFatKg: 6,
        leftDetachLeanKg: 20,
        leftLegWeightKg: 9,
      });
    expect(up.status).toBe(200);

    expect(up.body.record.slaughterRatePct).toBeCloseTo(76, 3);
    expect(up.body.record.legHipRatioPct).toBeCloseTo((9 / 38) * 100, 3);
    expect(up.body.record.skinRatePct).toBeCloseTo((4 / 35) * 100, 3);
    expect(up.body.record.boneRatePct).toBeCloseTo((5 / 35) * 100, 3);
    expect(up.body.record.fatRatePct).toBeCloseTo((6 / 35) * 100, 3);
    expect(up.body.record.leanRatePct).toBeCloseTo((20 / 35) * 100, 3);
    expect(up.body.record.detachLossPct).toBeCloseTo(((38 - 35) / 38) * 100, 3);
    expect(up.body.warnings.length).toBe(1);
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

    const otherPig = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        breedId: 1,
        individualNo: 'X',
        earTagNo: 'C-E002',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(otherPig.status).toBe(201);

    const adminToken = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );
    const pigInOtherUnit = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        unitId: 2,
        breedId: 1,
        individualNo: 'Y',
        earTagNo: 'C-E003',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(pigInOtherUnit.status).toBe(201);

    const res = await request(app.getHttpServer())
      .put(`/pigs/${pigInOtherUnit.body.id}/carcass`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        preSlaughterWeightKg: 100,
        carcassWeightLeftKg: 30,
        carcassWeightRightKg: 30,
      });

    expect(res.status).toBe(403);
  });
});
