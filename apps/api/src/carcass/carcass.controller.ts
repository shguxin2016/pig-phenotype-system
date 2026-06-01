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
import { CarcassService } from './carcass.service';

@UseGuards(JwtAuthGuard)
@Controller('pigs/:pigId/carcass')
export class CarcassController {
  constructor(private readonly carcass: CarcassService) {}

  @Get()
  async get(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
  ) {
    return this.carcass.get(req.user, pigId);
  }

  @Put()
  async upsert(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
    @Body() body: any,
  ) {
    return this.carcass.upsert(req.user, pigId, body);
  }
}
