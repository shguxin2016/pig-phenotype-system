import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarcassTraitEntity, PigEntity } from '../db/entities';
import { CarcassController } from './carcass.controller';
import { CarcassService } from './carcass.service';

@Module({
  imports: [TypeOrmModule.forFeature([CarcassTraitEntity, PigEntity])],
  controllers: [CarcassController],
  providers: [CarcassService],
})
export class CarcassModule {}
