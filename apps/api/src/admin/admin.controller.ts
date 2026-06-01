import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminUsersService } from './admin-users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('管理单位')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get('units')
  async listUnits() {
    return this.adminUsers.listUnits();
  }

  @Get('users')
  async listUsers() {
    return this.adminUsers.listUsers();
  }

  @Post('users')
  async createUser(
    @Body() body: { unitId: number; username: string; password?: string },
  ) {
    return this.adminUsers.createUser(body);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { username?: string; isActive?: boolean },
  ) {
    return this.adminUsers.updateUser(id, body);
  }

  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { password?: string },
  ) {
    return this.adminUsers.resetPassword(id, body);
  }
}
