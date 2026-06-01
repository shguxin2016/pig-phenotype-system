import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Excel pigs import (e2e)', () => {
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

  it('validate -> commit creates pigs', async () => {
    await startApp();
    const token = await loginAdmin();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('pigs');
    ws.addRow([
      '耳标号 ear_tag_no',
      '个体号 individual_no',
      '品种 breed_name',
      '性别 sex',
      '出生日期 birth_date',
      '母猪耳号 dam_ear_tag_no',
      '备注 remark',
    ]);
    ws.addRow(['EXCEL_E001', 'I001', '梅山', '母', '2026-01-01', '', '']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const validateRes = await request(app.getHttpServer())
      .post('/excel/imports/pigs/validate?unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, { filename: 'pigs.xlsx' });
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.batchId).toBeTruthy();
    expect(validateRes.body.summary.errorRows).toBe(0);

    const batchId = validateRes.body.batchId as number;

    const commitRes = await request(app.getHttpServer())
      .post('/excel/imports/pigs/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId });
    expect(commitRes.status).toBe(201);
    expect(commitRes.body.ok).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get('/pigs?q=EXCEL_E001')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(
      listRes.body.rows.some((r: any) => r.earTagNo === 'EXCEL_E001'),
    ).toBe(true);
  });
});
