import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { MeatqService } from './meatq.service';
import type { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('pigs/:pigId/meatq')
export class MeatqController {
  constructor(private readonly meatq: MeatqService) {}

  @Get()
  async get(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
    @Res() res: Response,
  ) {
    const result = await this.meatq.get(req.user, pigId);
    return res.json(result);
  }

  @Put()
  async upsert(
    @Req() req: { user: JwtPayload },
    @Param('pigId', ParseIntPipe) pigId: number,
    @Body() body: any,
  ) {
    return this.meatq.upsert(req.user, pigId, body);
  }
}
