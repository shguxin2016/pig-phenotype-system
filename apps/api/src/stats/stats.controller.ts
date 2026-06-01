import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { StatsService } from './stats.service';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('coverage')
  async coverage(
    @Req() req: { user: JwtPayload },
    @Query('unitId') unitId?: string,
    @Query('breedId') breedId?: string,
  ) {
    return this.stats.coverage(req.user, unitId, breedId);
  }
}

