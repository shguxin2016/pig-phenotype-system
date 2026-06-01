import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Excel growth import (e2e)', () => {
  let app: INestApplication<App>;

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

  const loginAdmin = async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      username: 'admin',
      unitName: '上海市动物疫病预防控制中心',
      password: 'test-password',
    });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  it('validate -> commit creates growth record', async () => {
    await startApp();
    const token = await loginAdmin();

    const earTagNo = `EXCEL_G${Date.now()}`;

    const pigWb = new ExcelJS.Workbook();
    const pigWs = pigWb.addWorksheet('pigs');
    pigWs.addRow([
      '耳标号 ear_tag_no',
      '个体号 individual_no',
      '品种 breed_name',
      '性别 sex',
      '出生日期 birth_date',
      '母猪耳号 dam_ear_tag_no',
      '备注 remark',
    ]);
    pigWs.addRow([earTagNo, 'IG001', '梅山', '母', '2026-01-01', '', '']);
    const pigBuf = Buffer.from(await pigWb.xlsx.writeBuffer());

    const pigValidate = await request(app.getHttpServer())
      .post('/excel/imports/pigs/validate?unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pigBuf, { filename: 'pigs.xlsx' });
    expect(pigValidate.status).toBe(201);
    expect(pigValidate.body.summary.errorRows).toBe(0);

    const pigBatchId = pigValidate.body.batchId as number;

    const pigCommit = await request(app.getHttpServer())
      .post('/excel/imports/pigs/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId: pigBatchId });
    expect(pigCommit.status).toBe(201);
    expect(pigCommit.body.ok).toBe(true);

    const growthWb = new ExcelJS.Workbook();
    const growthWs = growthWb.addWorksheet('growth');
    growthWs.addRow([
      '耳标号 ear_tag_no',
      '始测日期 start_date',
      '始测体重 start_weight_kg',
      '结测日期 end_date',
      '结测体重 end_weight_kg',
      '耗料 feed_kg',
      '结测背膘 end_backfat_mm',
      '结测眼肌面积 end_ema_cm2',
      '备注 remark',
    ]);
    growthWs.addRow([earTagNo, '2026-03-01', 30, '2026-05-20', 110, 200, 12, 45, '']);
    const growthBuf = Buffer.from(await growthWb.xlsx.writeBuffer());

    const validateRes = await request(app.getHttpServer())
      .post('/excel/imports/growth/validate?unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', growthBuf, { filename: 'growth.xlsx' });
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.summary.errorRows).toBe(0);

    const batchId = validateRes.body.batchId as number;

    const commitRes = await request(app.getHttpServer())
      .post('/excel/imports/growth/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId });
    expect(commitRes.status).toBe(201);
    expect(commitRes.body.ok).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get(`/pigs?q=${encodeURIComponent(earTagNo)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const pigId = listRes.body.rows.find((r: any) => r.earTagNo === earTagNo)?.id;
    expect(typeof pigId).toBe('number');

    const growthRes = await request(app.getHttpServer())
      .get(`/pigs/${pigId}/growth`)
      .set('Authorization', `Bearer ${token}`);
    expect(growthRes.status).toBe(200);
    expect(growthRes.body?.pigId).toBe(pigId);
    expect(growthRes.body?.testDays).toBeGreaterThan(0);
    expect(growthRes.body?.adgG).toBeTruthy();
  });
});

