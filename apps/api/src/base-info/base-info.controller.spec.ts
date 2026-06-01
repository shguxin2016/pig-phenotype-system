import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { UserEntity } from '../db/entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';

describe('BaseInfoController', () => {
  let app: INestApplication;
  let userRepo: Repository<UserEntity>;

  type Unit = { id: number; name: string; type: string };

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

  const listUnits = async () => {
    const res = await request(app.getHttpServer()).get('/meta/units');
    expect(res.status).toBe(200);
    return res.body as Unit[];
  };

  const login = async (username: string, unitName: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, unitName, password });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
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
      } as any),
    );
  };

  it('breeder ignores unitId on write/read', async () => {
    await startApp();
    const units = await listUnits();
    const breederUnit = units.find((u) => u.type === '保种场');
    const adminUnit = units.find((u) => u.type === '管理单位');
    expect(breederUnit).toBeTruthy();
    expect(adminUnit).toBeTruthy();

    await createUser({
      username: 'breeder',
      password: 'pw',
      role: '保种场',
      unitId: breederUnit!.id,
      unitName: breederUnit!.name,
    });
    const token = await login('breeder', breederUnit!.name, 'pw');

    const put = await request(app.getHttpServer())
      .put(`/base-info?year=2026&unitId=${adminUnit!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'U2', level: '国家级', fillDate: '2026-05-01' } });
    expect(put.status).toBe(200);
    expect(put.body.record.unitId).toBe(breederUnit!.id);

    const get = await request(app.getHttpServer())
      .get(`/base-info?year=2026&unitId=${adminUnit!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.unitId).toBe(breederUnit!.id);
  });

  it('admin can write arbitrary unitId; get defaults to own unitId', async () => {
    await startApp();
    const units = await listUnits();
    const adminUnit = units.find((u) => u.type === '管理单位');
    const otherUnit = units.find((u) => u.type === '保种场');
    expect(adminUnit).toBeTruthy();
    expect(otherUnit).toBeTruthy();

    const token = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );

    const put2 = await request(app.getHttpServer())
      .put(`/base-info?year=2026&unitId=${otherUnit!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'U2', level: '国家级' } });
    expect(put2.status).toBe(200);
    expect(put2.body.record.unitId).toBe(otherUnit!.id);

    const put1 = await request(app.getHttpServer())
      .put(`/base-info?year=2026&unitId=${adminUnit!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'U1', level: '国家级' } });
    expect(put1.status).toBe(200);
    expect(put1.body.record.unitId).toBe(adminUnit!.id);

    const getDefault = await request(app.getHttpServer())
      .get('/base-info?year=2026')
      .set('Authorization', `Bearer ${token}`);
    expect(getDefault.status).toBe(200);
    expect(getDefault.body.unitId).toBe(adminUnit!.id);
  });

  it('tester is read-only; must provide unitId for get; put forbidden', async () => {
    await startApp();
    const units = await listUnits();
    const testerUnit = units.find((u) => u.type === '测定中心');
    const adminUnit = units.find((u) => u.type === '管理单位');
    expect(testerUnit).toBeTruthy();
    expect(adminUnit).toBeTruthy();

    await createUser({
      username: 'tester',
      password: 'pw',
      role: '测定中心',
      unitId: testerUnit!.id,
      unitName: testerUnit!.name,
    });
    const token = await login('tester', testerUnit!.name, 'pw');

    const getNoUnit = await request(app.getHttpServer())
      .get('/base-info?year=2026')
      .set('Authorization', `Bearer ${token}`);
    expect(getNoUnit.status).toBe(400);

    const put = await request(app.getHttpServer())
      .put(`/base-info?year=2026&unitId=${adminUnit!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'x', level: '国家级' } });
    expect(put.status).toBe(403);
  });

  it('upsert keeps same id for same unitId+year', async () => {
    await startApp();
    const units = await listUnits();
    const adminUnit = units.find((u) => u.type === '管理单位');
    expect(adminUnit).toBeTruthy();

    const token = await login(
      'admin',
      '上海市动物疫病预防控制中心',
      'test-password',
    );

    const put1 = await request(app.getHttpServer())
      .put(`/base-info?year=2026&unitId=${adminUnit!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'U1', level: '国家级', address: 'a' } });
    expect(put1.status).toBe(200);

    const put2 = await request(app.getHttpServer())
      .put(`/base-info?year=2026&unitId=${adminUnit!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'U1-2', level: '国家级', address: 'b' } });
    expect(put2.status).toBe(200);
    expect(put2.body.record.id).toBe(put1.body.record.id);
    expect(put2.body.record.data.address).toBe('b');
  });
});
