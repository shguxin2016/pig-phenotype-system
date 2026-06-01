import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
} from '../db/entities';
import { ExcelController } from './excel.controller';
import { ExcelService } from './excel.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImportBatchEntity,
      ImportRowErrorEntity,
      PigEntity,
      UnitEntity,
      BreedEntity,
      GrowthTestEntity,
      ReproLitterEntity,
      ReproPigletEntity,
      CarcassTraitEntity,
      MeatQualityEntity,
      ConservationBaseInfoEntity,
    ]),
  ],
  controllers: [ExcelController],
  providers: [ExcelService],
})
export class ExcelModule {}
