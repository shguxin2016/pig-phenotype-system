import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BreedEntity, UnitEntity, UserEntity } from './entities';
import { SeedService } from './seed.service';
import { buildTypeOrmModuleOptions } from './typeorm-options';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildTypeOrmModuleOptions(process.env),
    }),
    TypeOrmModule.forFeature([UnitEntity, BreedEntity, UserEntity]),
  ],
  providers: [SeedService],
})
export class DbModule {}
