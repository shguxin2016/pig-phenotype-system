import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { PigsService } from './pigs.service';

@UseGuards(JwtAuthGuard)
@Controller('pigs')
export class PigsController {
  constructor(private readonly pigs: PigsService) {}

  @Get()
  async list(
    @Req() req: { user: JwtPayload },
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.pigs.list(req.user, {
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':id')
  async get(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pigs.get(req.user, id);
  }

  @Post()
  async create(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.pigs.create(req.user, body);
  }

  @Patch(':id')
  async update(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.pigs.update(req.user, id, body);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pigs.remove(req.user, id);
  }
}
