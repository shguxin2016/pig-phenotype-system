import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { BaseInfoService } from './base-info.service';

@UseGuards(JwtAuthGuard)
@Controller('base-info')
export class BaseInfoController {
  constructor(private readonly baseInfo: BaseInfoService) {}

  @Get()
  async get(
    @Req() req: { user: JwtPayload },
    @Query('year') year: string,
    @Query('unitId') unitId?: string,
  ) {
    return this.baseInfo.get(req.user, year, unitId);
  }

  @Put()
  async upsert(
    @Req() req: { user: JwtPayload },
    @Query('year') year: string,
    @Query('unitId') unitId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.baseInfo.upsert(req.user, year, unitId, body);
  }
}

