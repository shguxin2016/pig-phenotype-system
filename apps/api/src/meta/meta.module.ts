import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BreedEntity, UnitEntity } from '../db/entities';
import { MetaController } from './meta.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UnitEntity, BreedEntity])],
  controllers: [MetaController],
})
export class MetaModule {}
