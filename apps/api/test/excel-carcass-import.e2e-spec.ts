import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Excel carcass import (e2e)', () => {
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

  it('validate -> commit creates carcass record and derived fields', async () => {
    await startApp();
    const token = await loginAdmin();

    const earTagNo = `EXCEL_C${Date.now()}`;

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
    pigWs.addRow([earTagNo, 'IC001', '梅山', '母', '2026-01-01', '', '']);
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

    const carcassWb = new ExcelJS.Workbook();
    const carcassWs = carcassWb.addWorksheet('carcass');
    carcassWs.addRow([
      '耳标号 ear_tag_no',
      '屠宰日期 slaughter_date',
      '宰前活重 pre_slaughter_weight_kg',
      '左胴体重 carcass_weight_left_kg',
      '右胴体重 carcass_weight_right_kg',
      '肋骨数 rib_count',
      '胴体长 carcass_length_cm',
      '体斜长 body_oblique_length_cm',
      '背膘(肩) backfat_shoulder_mm',
      '背膘(最后肋) backfat_last_rib_mm',
      '背膘(腰荐) backfat_lumbar_mm',
      '皮厚(6~7肋) skin_thickness_6_7_rib_mm',
      '眼肌面积 ema_last_rib_cm2',
      '眼肌高 ema_height_cm',
      '眼肌宽 ema_width_cm',
      '皮重(kg) left_detach_skin_kg',
      '骨重(kg) left_detach_bone_kg',
      '肥肉重(kg) left_detach_fat_kg',
      '瘦肉重(kg) left_detach_lean_kg',
      '左腿臀重(kg) left_leg_weight_kg',
      '蹄重(kg) hoof_weight_kg',
      '头重(kg) head_weight_kg',
      '备注 remark',
    ]);
    carcassWs.addRow([
      earTagNo,
      '2026-05-01',
      100,
      40,
      40,
      14,
      80,
      85,
      12,
      14,
      13,
      3,
      45,
      12,
      6,
      3,
      5,
      8,
      23,
      10,
      0.8,
      4.5,
      '',
    ]);
    const carcassBuf = Buffer.from(await carcassWb.xlsx.writeBuffer());

    const validateRes = await request(app.getHttpServer())
      .post('/excel/imports/carcass/validate?unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', carcassBuf, { filename: 'carcass.xlsx' });
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.summary.errorRows).toBe(0);

    const commitRes = await request(app.getHttpServer())
      .post('/excel/imports/carcass/commit')
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

    const carcassRes = await request(app.getHttpServer())
      .get(`/pigs/${pigId}/carcass`)
      .set('Authorization', `Bearer ${token}`);
    expect(carcassRes.status).toBe(200);
    expect(carcassRes.body?.record?.pigId).toBe(pigId);
    expect(carcassRes.body?.record?.slaughterRatePct).toBeCloseTo(80, 3);
    expect(carcassRes.body?.record?.legHipRatioPct).toBeCloseTo(25, 3);
    expect(Array.isArray(carcassRes.body?.warnings)).toBe(true);
    expect(carcassRes.body.warnings.length).toBeGreaterThan(0);
  });
});

