import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Excel meatq import (e2e)', () => {
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

  it('validate -> commit creates meatq record and warnings', async () => {
    await startApp();
    const token = await loginAdmin();

    const earTagNo = `EXCEL_M${Date.now()}`;

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
    pigWs.addRow([earTagNo, 'IM001', '梅山', '母', '2026-01-01', '', '']);
    const pigBuf = Buffer.from(await pigWb.xlsx.writeBuffer());

    const pigValidate = await request(app.getHttpServer())
      .post('/excel/imports/pigs/validate?unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pigBuf, { filename: 'pigs.xlsx' });
    expect(pigValidate.status).toBe(201);
    expect(pigValidate.body.summary.errorRows).toBe(0);

    const pigCommit = await request(app.getHttpServer())
      .post('/excel/imports/pigs/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId: pigValidate.body.batchId });
    expect(pigCommit.status).toBe(201);
    expect(pigCommit.body.ok).toBe(true);

    const meatqWb = new ExcelJS.Workbook();
    const meatqWs = meatqWb.addWorksheet('meatq');
    meatqWs.addRow([
      '耳标号 ear_tag_no',
      '肉色评分 color_score',
      'L* color_l',
      'a* color_a',
      'b* color_b',
      'pH(1h) ph_1h',
      'pH(24h) ph_24h',
      '滴水损失(%) drip_loss_pct',
      '系水力(%) water_holding_pct',
      '大理石纹评分 marbling_score',
      '肌内脂肪(%) imf_pct',
      '肌间脂肪(%) imp_pct',
      '水分(%) moisture_pct',
      '嫩度剪切力(N) tenderness_shear_n',
      '熟肉率(%) cooked_meat_rate',
      '备注 remark',
    ]);
    meatqWs.addRow([earTagNo, 3, 62, 10, 5, 5.6, 5.4, 6.2, 40, 2, 2.1, 1.2, 72, 35, 68, '']);
    const meatqBuf = Buffer.from(await meatqWb.xlsx.writeBuffer());

    const validateRes = await request(app.getHttpServer())
      .post('/excel/imports/meatq/validate?unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', meatqBuf, { filename: 'meatq.xlsx' });
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.summary.errorRows).toBe(0);

    const commitRes = await request(app.getHttpServer())
      .post('/excel/imports/meatq/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId: validateRes.body.batchId });
    expect(commitRes.status).toBe(201);
    expect(commitRes.body.ok).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get(`/pigs?q=${encodeURIComponent(earTagNo)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const pigId = listRes.body.rows.find((r: any) => r.earTagNo === earTagNo)?.id;
    expect(typeof pigId).toBe('number');

    const meatqRes = await request(app.getHttpServer())
      .get(`/pigs/${pigId}/meatq`)
      .set('Authorization', `Bearer ${token}`);
    expect(meatqRes.status).toBe(200);
    expect(meatqRes.body?.record?.pigId).toBe(pigId);
    expect(Array.isArray(meatqRes.body?.warnings)).toBe(true);
    expect(meatqRes.body.warnings.length).toBeGreaterThan(0);
  });
});

