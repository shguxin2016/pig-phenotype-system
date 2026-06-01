import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConservationBaseInfoEntity, UnitEntity } from '../db/entities';
import { BaseInfoController } from './base-info.controller';
import { BaseInfoService } from './base-info.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConservationBaseInfoEntity, UnitEntity])],
  controllers: [BaseInfoController],
  providers: [BaseInfoService],
})
export class BaseInfoModule {}

