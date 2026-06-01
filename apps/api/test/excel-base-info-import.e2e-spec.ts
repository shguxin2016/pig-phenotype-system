import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const binaryParser = (res: any, cb: any) => {
  const data: Buffer[] = [];
  res.on('data', (chunk: Buffer) => data.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(data)));
};

describe('Excel base_info import (e2e)', () => {
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

  it('validate -> commit -> export roundtrip', async () => {
    await startApp();
    const token = await loginAdmin();

    const year = 2026;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('base_info');
    ws.addRow([
      '名称 name',
      '级别 level',
      '编号 code',
      '地址 address',
      '负责人 principal',
      '电话 phone',
      '邮箱 email',
      '畜禽养殖场代码 farmCode',
      '专业技术人员数量 technicianCount',
      '技术负责人 technicalPrincipal',
      '学历或职称 technicalTitleOrDegree',
      '保护品种名称 protectedBreedName',
      '存栏数量 inStockCount',
      '家系数量 familyCount',
      '种畜数量 breedingCount',
      '种公畜数量 breedingMaleCount',
      '基础母畜数量 breedingFemaleBaseCount',
      '后备畜群数量 reserveCount',
      '后备公畜数量 reserveMaleCount',
      '后备母畜数量 reserveFemaleCount',
      '占地面积(㎡) landAreaM2',
      '畜舍面积(㎡) housingAreaM2',
      '固定资产(万元) fixedAssets10kCny',
      '填表人 filler',
      '联系方式 contact',
      '日期 fillDate',
    ]);
    ws.addRow([
      '示范保种场',
      '国家级',
      'A-001',
      '上海',
      '张三',
      '021-12345678',
      'a@example.com',
      'FC-001',
      3,
      '李四',
      '本科',
      '梅山',
      1200,
      10,
      300,
      40,
      180,
      120,
      30,
      90,
      20000,
      5000,
      800,
      '王五',
      '021-12345678',
      '2026-05-01',
    ]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const validateRes = await request(app.getHttpServer())
      .post(`/excel/imports/base_info/validate?unitId=1&year=${year}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, { filename: 'base-info.xlsx' });
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.summary.errorRows).toBe(0);

    const commitRes = await request(app.getHttpServer())
      .post('/excel/imports/base_info/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId: validateRes.body.batchId });
    expect(commitRes.status).toBe(201);
    expect(commitRes.body.ok).toBe(true);

    const exportRes = await request(app.getHttpServer())
      .get(`/excel/exports/base_info?unitId=1&year=${year}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);
    expect(exportRes.status).toBe(200);

    const outWb = new ExcelJS.Workbook();
    await outWb.xlsx.load(exportRes.body as any);
    const outWs = outWb.worksheets[0]!;
    expect(outWs.getRow(2).getCell(1).value).toBe('示范保种场');
    expect(outWs.getRow(2).getCell(2).value).toBe('国家级');
    expect(outWs.getRow(2).getCell(13).value).toBe(1200);
    expect(outWs.getRow(2).getCell(26).value).toBe('2026-05-01');
  });
});

