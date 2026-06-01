import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { UserEntity } from '../db/entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';

type Unit = { id: number; name: string; type: string };
type Breed = { id: number; name: string };

describe('StatsController', () => {
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
    userRepo = moduleRef.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  const login = async (username: string, unitName: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, unitName, password });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  };

  const listUnits = async () => {
    const res = await request(app.getHttpServer()).get('/meta/units');
    expect(res.status).toBe(200);
    return res.body as Unit[];
  };

  const listBreeds = async () => {
    const res = await request(app.getHttpServer()).get('/meta/breeds');
    expect(res.status).toBe(200);
    return res.body as Breed[];
  };

  const createUser = async (args: {
    username: string;
    password: string;
    role: string;
    unitId: number;
    unitName: string;
  }) => {
    await userRepo.save(
      userRepo.create({
        username: args.username,
        passwordHash: await hashPassword(args.password),
        role: args.role,
        unitId: args.unitId,
        unitName: args.unitName,
        isActive: true,
      } as any),
    );
  };

  const createPig = async (
    token: string,
    body: {
      unitId: number;
      breedId: number;
      individualNo: string;
      earTagNo: string;
      sex: string;
      birthDate: string;
    },
  ) => {
    const res = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.id as number;
  };

  it('aggregates counts by unit×breed and enforces breeder scope', async () => {
    await startApp();
    const units = await listUnits();
    const breeds = await listBreeds();

    const u1 = units.find((u) => u.type === '保种场');
    const u2 = units.filter((u) => u.type === '保种场')[1];
    expect(u1).toBeTruthy();
    expect(u2).toBeTruthy();

    const b1 = breeds[0];
    const b2 = breeds[1];
    expect(b1).toBeTruthy();
    expect(b2).toBeTruthy();

    const adminToken = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );

    const a1 = await createPig(adminToken, {
      unitId: u1!.id,
      breedId: b1!.id,
      individualNo: 'A1',
      earTagNo: 'S-A1',
      sex: '母',
      birthDate: '2026-01-01',
    });
    const a2 = await createPig(adminToken, {
      unitId: u1!.id,
      breedId: b1!.id,
      individualNo: 'A2',
      earTagNo: 'S-A2',
      sex: '母',
      birthDate: '2026-01-02',
    });
    const a3 = await createPig(adminToken, {
      unitId: u1!.id,
      breedId: b2!.id,
      individualNo: 'A3',
      earTagNo: 'S-A3',
      sex: '母',
      birthDate: '2026-01-03',
    });

    const bP1 = await createPig(adminToken, {
      unitId: u2!.id,
      breedId: b1!.id,
      individualNo: 'B1',
      earTagNo: 'S-B1',
      sex: '母',
      birthDate: '2026-01-04',
    });
    const bP2 = await createPig(adminToken, {
      unitId: u2!.id,
      breedId: b2!.id,
      individualNo: 'B2',
      earTagNo: 'S-B2',
      sex: '母',
      birthDate: '2026-01-05',
    });
    const bP3 = await createPig(adminToken, {
      unitId: u2!.id,
      breedId: b2!.id,
      individualNo: 'B3',
      earTagNo: 'S-B3',
      sex: '母',
      birthDate: '2026-01-06',
    });
    const bP4 = await createPig(adminToken, {
      unitId: u2!.id,
      breedId: b2!.id,
      individualNo: 'B4',
      earTagNo: 'S-B4',
      sex: '母',
      birthDate: '2026-01-07',
    });

    const g1 = await request(app.getHttpServer())
      .put(`/pigs/${a1}/growth`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startDate: '2026-02-01',
        startWeightKg: 30,
        endDate: '2026-03-01',
        endWeightKg: 60,
        feedKg: 100,
      });
    expect(g1.status).toBe(200);

    const g2 = await request(app.getHttpServer())
      .put(`/pigs/${bP1}/growth`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startDate: '2026-02-01',
        startWeightKg: 30,
        endDate: '2026-03-01',
        endWeightKg: 60,
        feedKg: 100,
      });
    expect(g2.status).toBe(200);

    const g3 = await request(app.getHttpServer())
      .put(`/pigs/${bP2}/growth`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startDate: '2026-02-01',
        startWeightKg: 30,
        endDate: '2026-03-01',
        endWeightKg: 60,
        feedKg: 100,
      });
    expect(g3.status).toBe(200);

    const r1 = await request(app.getHttpServer())
      .put(`/pigs/${a2}/repro`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        litter: { damEarTagNo: 'D1', farrowingDate: '2026-04-01' },
        piglet: {},
      });
    expect(r1.status).toBe(200);

    const r2 = await request(app.getHttpServer())
      .put(`/pigs/${bP2}/repro`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        litter: { damEarTagNo: 'D2', farrowingDate: '2026-04-01' },
        piglet: {},
      });
    expect(r2.status).toBe(200);

    const r3 = await request(app.getHttpServer())
      .put(`/pigs/${bP3}/repro`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        litter: { damEarTagNo: 'D3', farrowingDate: '2026-04-01' },
        piglet: {},
      });
    expect(r3.status).toBe(200);

    const c1 = await request(app.getHttpServer())
      .put(`/pigs/${a1}/carcass`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(c1.status).toBe(200);

    const c2 = await request(app.getHttpServer())
      .put(`/pigs/${a3}/carcass`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(c2.status).toBe(200);

    const c3 = await request(app.getHttpServer())
      .put(`/pigs/${bP4}/carcass`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(c3.status).toBe(200);

    const m1 = await request(app.getHttpServer())
      .put(`/pigs/${a3}/meatq`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(m1.status).toBe(200);

    const m2 = await request(app.getHttpServer())
      .put(`/pigs/${bP2}/meatq`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(m2.status).toBe(200);

    const cov = await request(app.getHttpServer())
      .get('/stats/coverage')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cov.status).toBe(200);
    expect(cov.body.rows.length).toBe(4);

    const key = (r: any) => `${r.unitId}-${r.breedId}`;
    const byKey = new Map(cov.body.rows.map((r: any) => [key(r), r]));

    expect(byKey.get(`${u1!.id}-${b1!.id}`)?.registryCount).toBe(2);
    expect(byKey.get(`${u1!.id}-${b1!.id}`)?.growthCount).toBe(1);
    expect(byKey.get(`${u1!.id}-${b1!.id}`)?.reproCount).toBe(1);
    expect(byKey.get(`${u1!.id}-${b1!.id}`)?.carcassCount).toBe(1);
    expect(byKey.get(`${u1!.id}-${b1!.id}`)?.meatqCount).toBe(0);

    expect(byKey.get(`${u1!.id}-${b2!.id}`)?.registryCount).toBe(1);
    expect(byKey.get(`${u1!.id}-${b2!.id}`)?.growthCount).toBe(0);
    expect(byKey.get(`${u1!.id}-${b2!.id}`)?.reproCount).toBe(0);
    expect(byKey.get(`${u1!.id}-${b2!.id}`)?.carcassCount).toBe(1);
    expect(byKey.get(`${u1!.id}-${b2!.id}`)?.meatqCount).toBe(1);

    expect(byKey.get(`${u2!.id}-${b1!.id}`)?.registryCount).toBe(1);
    expect(byKey.get(`${u2!.id}-${b1!.id}`)?.growthCount).toBe(1);
    expect(byKey.get(`${u2!.id}-${b1!.id}`)?.reproCount).toBe(0);
    expect(byKey.get(`${u2!.id}-${b1!.id}`)?.carcassCount).toBe(0);
    expect(byKey.get(`${u2!.id}-${b1!.id}`)?.meatqCount).toBe(0);

    expect(byKey.get(`${u2!.id}-${b2!.id}`)?.registryCount).toBe(3);
    expect(byKey.get(`${u2!.id}-${b2!.id}`)?.growthCount).toBe(1);
    expect(byKey.get(`${u2!.id}-${b2!.id}`)?.reproCount).toBe(2);
    expect(byKey.get(`${u2!.id}-${b2!.id}`)?.carcassCount).toBe(1);
    expect(byKey.get(`${u2!.id}-${b2!.id}`)?.meatqCount).toBe(1);

    expect(cov.body.totals.registryCount).toBe(7);
    expect(cov.body.totals.growthCount).toBe(3);
    expect(cov.body.totals.reproCount).toBe(3);
    expect(cov.body.totals.carcassCount).toBe(3);
    expect(cov.body.totals.meatqCount).toBe(2);

    await createUser({
      username: 'breeder',
      password: 'pw',
      role: '保种场',
      unitId: u1!.id,
      unitName: u1!.name,
    });
    const breederToken = await login('breeder', u1!.name, 'pw');

    const breederCov = await request(app.getHttpServer())
      .get(`/stats/coverage?unitId=${u2!.id}`)
      .set('Authorization', `Bearer ${breederToken}`);
    expect(breederCov.status).toBe(200);
    expect(breederCov.body.rows.every((r: any) => r.unitId === u1!.id)).toBe(true);
  });
});

