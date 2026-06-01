import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BreedEntity,
  CarcassTraitEntity,
  GrowthTestEntity,
  MeatQualityEntity,
  PigEntity,
  ReproPigletEntity,
  UnitEntity,
} from '../db/entities';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PigEntity,
      UnitEntity,
      BreedEntity,
      GrowthTestEntity,
      ReproPigletEntity,
      CarcassTraitEntity,
      MeatQualityEntity,
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}

