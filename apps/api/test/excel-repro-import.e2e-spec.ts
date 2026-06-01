import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Excel repro import (e2e)', () => {
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

  it('validate -> commit creates shared litter and two piglets', async () => {
    await startApp();
    const token = await loginAdmin();

    const ear1 = `EXCEL_R1_${Date.now()}`;
    const ear2 = `EXCEL_R2_${Date.now()}`;
    const dam = `DAM_${Date.now()}`;
    const farrowingDate = '2026-04-01';

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
    pigWs.addRow([ear1, 'IR001', '梅山', '母', '2026-01-01', '', '']);
    pigWs.addRow([ear2, 'IR002', '梅山', '母', '2026-01-02', '', '']);
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

    const reproWb = new ExcelJS.Workbook();
    const reproWs = reproWb.addWorksheet('repro');
    reproWs.addRow([
      '耳标号 ear_tag_no',
      '母猪耳号 dam_ear_tag_no',
      '分娩日期 farrowing_date',
      '配种日期 mating_date',
      '公猪耳号 boar_ear_tag_no',
      '胎次 parity',
      '公仔数 male_born',
      '母仔数 female_born',
      '死胎数 stillborn_count',
      '木乃伊胎数 mummy_count',
      '畸形数 malformed_count',
      '弱仔数 weak_count',
      '断奶日期 wean_date',
      '断奶仔猪数 wean_count',
      '断奶窝重 wean_litter_weight_kg',
      '窝备注 remark',
      '初生重 birth_weight_kg',
      '左乳头数 left_teats',
      '右乳头数 right_teats',
      '断奶重 wean_weight_ind_kg',
      '个体备注 piglet_remark',
    ]);
    reproWs.addRow([
      ear1,
      dam,
      farrowingDate,
      '2026-02-10',
      'BOAR_1',
      2,
      6,
      5,
      0,
      0,
      0,
      1,
      '2026-04-28',
      10,
      65.5,
      'litter',
      1.25,
      7,
      7,
      6.2,
      'piglet1',
    ]);
    reproWs.addRow([
      ear2,
      dam,
      farrowingDate,
      '2026-02-10',
      'BOAR_1',
      2,
      6,
      5,
      0,
      0,
      0,
      1,
      '2026-04-28',
      10,
      65.5,
      'litter',
      1.1,
      6,
      7,
      5.9,
      'piglet2',
    ]);
    const reproBuf = Buffer.from(await reproWb.xlsx.writeBuffer());

    const validateRes = await request(app.getHttpServer())
      .post('/excel/imports/repro/validate?unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', reproBuf, { filename: 'repro.xlsx' });
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.summary.errorRows).toBe(0);

    const commitRes = await request(app.getHttpServer())
      .post('/excel/imports/repro/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId: validateRes.body.batchId });
    expect(commitRes.status).toBe(201);
    expect(commitRes.body.ok).toBe(true);

    const listRes = await request(app.getHttpServer())
      .get(`/pigs?q=${encodeURIComponent(ear1)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const pig1Id = listRes.body.rows.find((r: any) => r.earTagNo === ear1)?.id;
    expect(typeof pig1Id).toBe('number');

    const listRes2 = await request(app.getHttpServer())
      .get(`/pigs?q=${encodeURIComponent(ear2)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes2.status).toBe(200);
    const pig2Id = listRes2.body.rows.find((r: any) => r.earTagNo === ear2)?.id;
    expect(typeof pig2Id).toBe('number');

    const repro1 = await request(app.getHttpServer())
      .get(`/pigs/${pig1Id}/repro`)
      .set('Authorization', `Bearer ${token}`);
    expect(repro1.status).toBe(200);
    expect(repro1.body?.litter?.damEarTagNo).toBe(dam);
    expect(repro1.body?.piglet?.pigId).toBe(pig1Id);

    const repro2 = await request(app.getHttpServer())
      .get(`/pigs/${pig2Id}/repro`)
      .set('Authorization', `Bearer ${token}`);
    expect(repro2.status).toBe(200);
    expect(repro2.body?.litter?.damEarTagNo).toBe(dam);
    expect(repro2.body?.piglet?.pigId).toBe(pig2Id);

    expect(repro1.body?.litter?.id).toBe(repro2.body?.litter?.id);
  });
});

