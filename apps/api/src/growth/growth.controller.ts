import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { GrowthService } from './growth.service';

@UseGuards(JwtAuthGuard)
@Controller('pigs/:pigId/growth')
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get()
  async get(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
  ) {
    return this.growth.get(req.user, pigId);
  }

  @Put()
  async upsert(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
    @Body() body: any,
  ) {
    return this.growth.upsert(req.user, pigId, body);
  }
}
