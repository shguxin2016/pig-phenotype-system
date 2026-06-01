import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeatQualityEntity, PigEntity } from '../db/entities';
import { MeatqController } from './meatq.controller';
import { MeatqService } from './meatq.service';

@Module({
  imports: [TypeOrmModule.forFeature([MeatQualityEntity, PigEntity])],
  controllers: [MeatqController],
  providers: [MeatqService],
})
export class MeatqModule {}
