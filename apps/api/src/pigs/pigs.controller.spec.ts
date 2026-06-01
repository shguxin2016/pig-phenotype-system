import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { UserEntity } from '../db/entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';

describe('PigsController', () => {
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

  it('enforces ear tag global uniqueness and individual no uniqueness within unit', async () => {
    await startApp();

    const token = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );

    const create1 = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 1,
        breedId: 1,
        individualNo: 'I001',
        earTagNo: 'E001',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(create1.status).toBe(201);

    const dupEar = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 2,
        breedId: 2,
        individualNo: 'I002',
        earTagNo: 'E001',
        sex: '母',
        birthDate: '2026-01-02',
      });
    expect(dupEar.status).toBe(400);

    const dupIndividualSameUnit = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 1,
        breedId: 1,
        individualNo: 'I001',
        earTagNo: 'E002',
        sex: '母',
        birthDate: '2026-01-03',
      });
    expect(dupIndividualSameUnit.status).toBe(400);

    const sameIndividualOtherUnit = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 2,
        breedId: 2,
        individualNo: 'I001',
        earTagNo: 'E003',
        sex: '母',
        birthDate: '2026-01-03',
      });
    expect(sameIndividualOtherUnit.status).toBe(201);
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

    const createOtherUnit = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: 2,
        breedId: 1,
        individualNo: 'X1',
        earTagNo: 'EFARM1',
        sex: '母',
        birthDate: '2026-01-01',
      });
    expect(createOtherUnit.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get('/pigs')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.rows.length).toBe(1);
    expect(list.body.rows[0].unitId).toBe(1);

    const adminToken = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );
    const adminList = await request(app.getHttpServer())
      .get('/pigs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.rows.length).toBeGreaterThanOrEqual(1);
  });
});
