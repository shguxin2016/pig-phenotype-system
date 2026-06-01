import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BreedEntity, PigEntity, UnitEntity } from '../db/entities';
import { PigsController } from './pigs.controller';
import { PigsService } from './pigs.service';

@Module({
  imports: [TypeOrmModule.forFeature([PigEntity, UnitEntity, BreedEntity])],
  controllers: [PigsController],
  providers: [PigsService],
})
export class PigsModule {}
