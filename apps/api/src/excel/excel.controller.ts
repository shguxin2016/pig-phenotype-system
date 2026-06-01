import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { JwtPayload } from '../auth/auth.types';
import { ExcelService } from './excel.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('excel')
export class ExcelController {
  constructor(private readonly excel: ExcelService) {}

  @Get('templates/:module')
  async template(
    @Req() req: { user: JwtPayload },
    @Param('module') module: string,
    @Res() res: Response,
  ) {
    const { filename, buffer } = await this.excel.generateTemplate(
      req.user,
      module,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return res.send(buffer);
  }

  @Get('exports/:module')
  async exportData(
    @Req() req: { user: JwtPayload },
    @Param('module') module: string,
    @Query('unitId') unitId: string | undefined,
    @Query('year') year: string | undefined,
    @Res() res: Response,
  ) {
    const { filename, buffer } = await this.excel.exportData(
      req.user,
      module,
      unitId,
      year,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return res.send(buffer);
  }

  @Roles('管理单位')
  @Post('imports/:module/validate')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_BYTES ?? 10485760),
      },
    }),
  )
  async validateImport(
    @Req() req: { user: JwtPayload },
    @Param('module') module: string,
    @Query('unitId') unitId: string | undefined,
    @Query('year') year: string | undefined,
    @UploadedFile() file?: { originalname: string; buffer: Buffer },
  ) {
    if (!file) throw new BadRequestException('file必填');
    return this.excel.validateImport(
      req.user,
      module,
      unitId,
      year,
      file.originalname,
      file.buffer,
    );
  }

  @Roles('管理单位')
  @Post('imports/:module/commit')
  async commitImport(
    @Req() req: { user: JwtPayload },
    @Param('module') module: string,
    @Body() body: { batchId?: number },
  ) {
    return this.excel.commitImport(req.user, module, body);
  }

  @Roles('管理单位')
  @Get('imports/:batchId/errors')
  async downloadErrors(
    @Req() req: { user: JwtPayload },
    @Param('batchId') batchId: string,
    @Res() res: Response,
  ) {
    const { filename, buffer } = await this.excel.exportErrors(
      req.user,
      batchId,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return res.send(buffer);
  }
}
