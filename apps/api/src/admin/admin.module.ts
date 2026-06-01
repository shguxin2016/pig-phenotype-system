import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../auth/roles.guard';
import { UnitEntity, UserEntity } from '../db/entities';
import { AdminController } from './admin.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UnitEntity])],
  controllers: [AdminController],
  providers: [AdminUsersService, RolesGuard],
})
export class AdminModule {}
