import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';
import {
  BreedEntity,
  CarcassTraitEntity,
  ConservationBaseInfoEntity,
  GrowthTestEntity,
  ImportBatchEntity,
  ImportRowErrorEntity,
  MeatQualityEntity,
  PigEntity,
  ReproLitterEntity,
  ReproPigletEntity,
  UnitEntity,
  UserEntity,
} from './entities';

const ENTITIES = [
  UnitEntity,
  BreedEntity,
  UserEntity,
  PigEntity,
  GrowthTestEntity,
  ReproLitterEntity,
  ReproPigletEntity,
  CarcassTraitEntity,
  MeatQualityEntity,
  ConservationBaseInfoEntity,
  ImportBatchEntity,
  ImportRowErrorEntity,
];

export const buildDataSourceOptions = (
  env: NodeJS.ProcessEnv,
): DataSourceOptions => {
  const dbType = env.DB_TYPE ?? 'sqljs';

  if (dbType === 'postgres') {
    const username = env.DB_USER ?? env.DB_USERNAME ?? 'postgres';
    const database = env.DB_NAME ?? env.DB_DATABASE ?? 'pigdb';

    return {
      type: 'postgres',
      host: env.DB_HOST ?? '127.0.0.1',
      port: env.DB_PORT ? Number(env.DB_PORT) : 5432,
      username,
      password: env.DB_PASSWORD ?? '',
      database,
      entities: ENTITIES,
      synchronize: env.DB_SYNCHRONIZE === 'true',
    };
  }

  return {
    type: 'sqljs',
    location: env.DB_SQLJS_PATH ?? 'data/dev.sqlite',
    autoSave: true,
    entities: ENTITIES,
    synchronize: true,
  };
};

export const buildTypeOrmModuleOptions = (
  env: NodeJS.ProcessEnv,
): TypeOrmModuleOptions => {
  return buildDataSourceOptions(env);
};
