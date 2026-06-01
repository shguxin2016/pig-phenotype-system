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
import { ReproService } from './repro.service';

@UseGuards(JwtAuthGuard)
@Controller('pigs/:pigId/repro')
export class ReproController {
  constructor(private readonly repro: ReproService) {}

  @Get()
  async get(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
  ) {
    return this.repro.get(req.user, pigId);
  }

  @Put()
  async upsert(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
    @Body() body: any,
  ) {
    return this.repro.upsert(req.user, pigId, body);
  }
}
