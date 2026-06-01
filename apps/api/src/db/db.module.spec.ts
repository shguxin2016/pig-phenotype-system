import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DbModule } from './db.module';
import { PigEntity } from './entities';

describe('DbModule', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.DB_TYPE = 'sqljs';
    process.env.DB_SQLJS_PATH = `data/test-${Date.now()}-${Math.random()}.sqlite`;

    const moduleRef = await Test.createTestingModule({
      imports: [DbModule],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('enforces pig ear tag uniqueness', async () => {
    const repo = dataSource.getRepository(PigEntity);

    await repo.insert({
      unitId: 1,
      breedId: 1,
      individualNo: 'A1',
      earTagNo: 'E001',
      sex: '母',
      birthDate: '2026-01-01',
      birthWeightKg: 1.2,
      damEarTagNo: null,
      remark: null,
    });

    await expect(
      repo.insert({
        unitId: 1,
        breedId: 1,
        individualNo: 'A2',
        earTagNo: 'E001',
        sex: '母',
        birthDate: '2026-01-02',
        birthWeightKg: 1.3,
        damEarTagNo: null,
        remark: null,
      }),
    ).rejects.toBeTruthy();
  });
});
