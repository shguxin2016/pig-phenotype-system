import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('MetaController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DB_TYPE = 'sqljs';
    process.env.DB_SQLJS_PATH = `data/test-${Date.now()}-${Math.random()}.sqlite`;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists units and breeds', async () => {
    const units = await request(app.getHttpServer()).get('/meta/units');
    expect(units.status).toBe(200);
    expect(units.body.length).toBe(7);

    const breeds = await request(app.getHttpServer()).get('/meta/breeds');
    expect(breeds.status).toBe(200);
    expect(breeds.body.length).toBe(5);
  });
});
