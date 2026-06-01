import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { CarcassModule } from './carcass/carcass.module';
import { GrowthModule } from './growth/growth.module';
import { MetaModule } from './meta/meta.module';
import { MeatqModule } from './meatq/meatq.module';
import { PigsModule } from './pigs/pigs.module';
import { ReproModule } from './repro/repro.module';
import { ExcelModule } from './excel/excel.module';
import { BaseInfoModule } from './base-info/base-info.module';
import { StatsModule } from './stats/stats.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    DbModule,
    AuthModule,
    AdminModule,
    PigsModule,
    GrowthModule,
    MetaModule,
    ReproModule,
    CarcassModule,
    MeatqModule,
    ExcelModule,
    BaseInfoModule,
    StatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
