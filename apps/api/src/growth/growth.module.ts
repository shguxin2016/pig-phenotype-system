import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BreedEntity, GrowthTestEntity, PigEntity } from '../db/entities';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GrowthTestEntity, PigEntity, BreedEntity]),
  ],
  controllers: [GrowthController],
  providers: [GrowthService],
})
export class GrowthModule {}
