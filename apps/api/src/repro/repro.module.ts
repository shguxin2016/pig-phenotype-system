import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PigEntity,
  ReproLitterEntity,
  ReproPigletEntity,
} from '../db/entities';
import { ReproController } from './repro.controller';
import { ReproService } from './repro.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReproLitterEntity, ReproPigletEntity, PigEntity]),
  ],
  controllers: [ReproController],
  providers: [ReproService],
})
export class ReproModule {}
