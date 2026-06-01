import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm-options';

export const AppDataSource = new DataSource(
  buildDataSourceOptions(process.env),
);
