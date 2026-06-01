import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEFAULT_DTSW_TARGET_WEIGHT_KG_BY_BREED_NAME } from '@shapcd/pig-shared';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import {
  computeCarcassDerived,
  normalizeCarcassInput,
  validateCarcassBasic,
  validateCarcassLogical,
} from '../carcass/carcass.logic';
import {
  computeMeatqWarnings,
  normalizeMeatqInput,
  validateMeatqStrong,
} from '../meatq/meatq.logic';
import {
  BreedEntity,
  CarcassTraitEntity,
  ConservationBaseInfoEntity,
  GrowthTestEntity,
  ImportBatchEntity,
  ImportBatchStatus,
  ImportRowErrorEntity,
  MeatQualityEntity,
  PigEntity,
  ReproLitterEntity,
  ReproPigletEntity,
  Sex,
  UnitEntity,
} from '../db/entities';

type FileResult = { filename: string; buffer: Buffer };

type ImportSummary = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningsCount: number;
};

type RowError = { rowNumber: number; field: string | null; message: string };

type PigsPayloadRow = {
  earTagNo: string;
  individualNo: string | null;
  breedId: number;
  sex: Sex;
  birthDate: string;
  damEarTagNo: string | null;
  remark: string | null;
};

type PigsPayload = { rows: PigsPayloadRow[] };

type GrowthPayloadRow = {
  pigId: number;
  startDate: string | null;
  startWeightKg: number | null;
  endDate: string | null;
  endWeightKg: number | null;
  feedKg: number | null;
  endBackfatMm: number | null;
  endEmaCm2: number | null;
  remark: string | null;
  startAgeDays: number | null;
  endAgeDays: number | null;
  testDays: number | null;
  adgG: number | null;
  adfiKg: number | null;
  fcr: number | null;
  dtswDays: number | null;
};

type GrowthPayload = { rows: GrowthPayloadRow[] };

type ReproPigletRow = {
  pigId: number;
  birthWeightKg: number | null;
  leftTeats: number | null;
  rightTeats: number | null;
  weanWeightIndKg: number | null;
  remark: string | null;
};

type ReproLitterGroup = {
  damEarTagNo: string;
  farrowingDate: string;
  litter: {
    boarEarTagNo: string | null;
    matingDate: string | null;
    parity: number | null;
    maleBorn: number | null;
    femaleBorn: number | null;
    stillbornCount: number | null;
    mummyCount: number | null;
    malformedCount: number | null;
    weakCount: number | null;
    weanDate: string | null;
    weanCount: number | null;
    weanLitterWeightKg: number | null;
    remark: string | null;
  };
  computed: { totalBorn: number | null; liveCount: number | null };
  piglets: ReproPigletRow[];
};

type ReproPayload = { groups: ReproLitterGroup[] };

type CarcassPayloadRow = {
  pigId: number;
  slaughterDate: string | null;
  preSlaughterWeightKg: number | null;
  carcassWeightLeftKg: number | null;
  carcassWeightRightKg: number | null;
  carcassLengthCm: number | null;
  bodyObliqueLengthCm: number | null;
  backfatShoulderMm: number | null;
  backfatLastRibMm: number | null;
  backfatLumbarMm: number | null;
  skinThickness6_7RibMm: number | null;
  emaLastRibCm2: number | null;
  emaHeightCm: number | null;
  emaWidthCm: number | null;
  leftDetachSkinKg: number | null;
  leftDetachBoneKg: number | null;
  leftDetachFatKg: number | null;
  leftDetachLeanKg: number | null;
  ribCount: number | null;
  hoofWeightKg: number | null;
  headWeightKg: number | null;
  leftLegWeightKg: number | null;
  detachLossPct: number | null;
  legHipRatioPct: number | null;
  skinRatePct: number | null;
  boneRatePct: number | null;
  fatRatePct: number | null;
  leanRatePct: number | null;
  slaughterRatePct: number | null;
  remark: string | null;
};

type CarcassPayload = { rows: CarcassPayloadRow[] };

type MeatqPayloadRow = {
  pigId: number;
  sex: string | null;
  colorScore: number | null;
  colorL: number | null;
  colorA: number | null;
  colorB: number | null;
  ph1h: number | null;
  ph24h: number | null;
  dripLossPct: number | null;
  waterHoldingPct: number | null;
  marblingScore: number | null;
  imfPct: number | null;
  impPct: number | null;
  moisturePct: number | null;
  tendernessShearN: number | null;
  cookedMeatRate: number | null;
  remark: string | null;
};

type MeatqPayload = { rows: MeatqPayloadRow[] };

type BaseInfoPayload = {
  unitId: number;
  year: number;
  data: Record<string, unknown>;
  fillDate: string | null;
};

@Injectable()
export class ExcelService {
  constructor(
    @InjectRepository(ImportBatchEntity)
    private readonly batches: Repository<ImportBatchEntity>,
    @InjectRepository(ImportRowErrorEntity)
    private readonly rowErrors: Repository<ImportRowErrorEntity>,
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>,
    @InjectRepository(GrowthTestEntity)
    private readonly growth: Repository<GrowthTestEntity>,
    @InjectRepository(ReproLitterEntity)
    private readonly reproLitters: Repository<ReproLitterEntity>,
    @InjectRepository(ReproPigletEntity)
    private readonly reproPiglets: Repository<ReproPigletEntity>,
    @InjectRepository(CarcassTraitEntity)
    private readonly carcass: Repository<CarcassTraitEntity>,
    @InjectRepository(MeatQualityEntity)
    private readonly meatq: Repository<MeatQualityEntity>,
    @InjectRepository(ConservationBaseInfoEntity)
    private readonly baseInfo: Repository<ConservationBaseInfoEntity>,
    @InjectRepository(UnitEntity)
    private readonly units: Repository<UnitEntity>,
    @InjectRepository(BreedEntity)
    private readonly breeds: Repository<BreedEntity>,
  ) {}

  async generateTemplate(
    user: JwtPayload,
    module: string,
  ): Promise<FileResult> {
    const m = this.assertModule(module);
    if (m === 'pigs') return this.generatePigsTemplate(user);
    if (m === 'growth') return this.generateGrowthTemplate(user);
    if (m === 'repro') return this.generateReproTemplate(user);
    if (m === 'carcass') return this.generateCarcassTemplate(user);
    if (m === 'meatq') return this.generateMeatqTemplate(user);
    if (m === 'base_info') return this.generateBaseInfoTemplate(user);
    throw new BadRequestException('module不支持');
  }

  async exportData(
    user: JwtPayload,
    module: string,
    unitId?: string,
    year?: string,
  ): Promise<FileResult> {
    const m = this.assertModule(module);
    if (m === 'pigs') return this.exportPigs(user, unitId);
    if (m === 'growth') return this.exportGrowth(user, unitId);
    if (m === 'repro') return this.exportRepro(user, unitId);
    if (m === 'carcass') return this.exportCarcass(user, unitId);
    if (m === 'meatq') return this.exportMeatq(user, unitId);
    if (m === 'base_info') return this.exportBaseInfo(user, unitId, year);
    void year;
    throw new BadRequestException('module不支持');
  }

  async validateImport(
    user: JwtPayload,
    module: string,
    unitId: string | undefined,
    year: string | undefined,
    filename: string,
    buffer: Buffer,
  ) {
    const m = this.assertModule(module);
    if (m === 'pigs')
      return this.validatePigs(user, unitId, year, filename, buffer);
    if (m === 'growth')
      return this.validateGrowth(user, unitId, year, filename, buffer);
    if (m === 'repro')
      return this.validateRepro(user, unitId, year, filename, buffer);
    if (m === 'carcass')
      return this.validateCarcass(user, unitId, year, filename, buffer);
    if (m === 'meatq')
      return this.validateMeatq(user, unitId, year, filename, buffer);
    if (m === 'base_info')
      return this.validateBaseInfo(user, unitId, year, filename, buffer);
    throw new BadRequestException('module不支持');
  }

  async commitImport(
    user: JwtPayload,
    module: string,
    body: { batchId?: number },
  ) {
    void user;
    const m = this.assertModule(module);
    if (typeof body?.batchId !== 'number') {
      throw new BadRequestException('batchId必填');
    }
    if (m === 'pigs') return this.commitPigs(m, body.batchId);
    if (m === 'growth') return this.commitGrowth(m, body.batchId);
    if (m === 'repro') return this.commitRepro(m, body.batchId);
    if (m === 'carcass') return this.commitCarcass(m, body.batchId);
    if (m === 'meatq') return this.commitMeatq(m, body.batchId);
    if (m === 'base_info') return this.commitBaseInfo(m, body.batchId);
    throw new BadRequestException('module不支持');
  }

  async exportErrors(user: JwtPayload, batchId: string): Promise<FileResult> {
    void user;
    const id = this.parsePositiveInt(batchId, 'batchId');
    const batch = await this.batches.findOne({ where: { id } });
    if (!batch) throw new NotFoundException('batch不存在');

    const rows = await this.rowErrors.find({
      where: { batchId: batch.id },
      order: { rowNumber: 'ASC', id: 'ASC' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('errors');
    ws.addRow(['row_no', 'field', 'message']);
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow([r.rowNumber, r.field ?? '', r.message]);
    }

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: `import-errors-${batch.id}.xlsx`,
      buffer: Buffer.from(out),
    };
  }

  private assertModule(
    module: string,
  ): 'pigs' | 'growth' | 'repro' | 'carcass' | 'meatq' | 'base_info' {
    if (module === 'pigs') return 'pigs';
    if (module === 'growth') return 'growth';
    if (module === 'repro') return 'repro';
    if (module === 'carcass') return 'carcass';
    if (module === 'meatq') return 'meatq';
    if (module === 'base_info') return 'base_info';
    throw new BadRequestException('module不支持');
  }

  private parsePositiveInt(s: string, name: string): number {
    const n = Number(s);
    if (!Number.isFinite(n) || Math.trunc(n) !== n || n <= 0) {
      throw new BadRequestException(`${name}不正确`);
    }
    return n;
  }

  private resolveUnitIdForRead(user: JwtPayload, unitId?: string): number {
    if (user.role === '保种场') return user.unitId;
    if (typeof unitId !== 'string') throw new BadRequestException('unitId必填');
    return this.parsePositiveInt(unitId, 'unitId');
  }

  private resolveUnitIdForImport(unitId?: string): number {
    if (typeof unitId !== 'string') throw new BadRequestException('unitId必填');
    return this.parsePositiveInt(unitId, 'unitId');
  }

  private parseYear(year?: string): number | null {
    if (typeof year !== 'string' || year.trim().length === 0) return null;
    const n = Number(year);
    if (!Number.isFinite(n) || Math.trunc(n) !== n || n < 1900 || n > 3000) {
      throw new BadRequestException('year不正确');
    }
    return n;
  }

  private async generatePigsTemplate(user: JwtPayload): Promise<FileResult> {
    void user;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('pigs');
    ws.addRow([
      '耳标号 ear_tag_no',
      '个体号 individual_no',
      '品种 breed_name',
      '性别 sex',
      '出生日期 birth_date',
      '母猪耳号 dam_ear_tag_no',
      '备注 remark',
    ]);
    ws.getRow(1).font = { bold: true };

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: 'pigs-template.xlsx',
      buffer: Buffer.from(out),
    };
  }

  private async generateGrowthTemplate(user: JwtPayload): Promise<FileResult> {
    void user;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('growth');
    ws.addRow([
      '耳标号 ear_tag_no',
      '始测日期 start_date',
      '始测体重 start_weight_kg',
      '结测日期 end_date',
      '结测体重 end_weight_kg',
      '耗料 feed_kg',
      '结测背膘 end_backfat_mm',
      '结测眼肌面积 end_ema_cm2',
      '备注 remark',
    ]);
    ws.getRow(1).font = { bold: true };

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: 'growth-template.xlsx',
      buffer: Buffer.from(out),
    };
  }

  private async generateReproTemplate(user: JwtPayload): Promise<FileResult> {
    void user;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('repro');
    ws.addRow([
      '耳标号 ear_tag_no',
      '母猪耳号 dam_ear_tag_no',
      '分娩日期 farrowing_date',
      '配种日期 mating_date',
      '公猪耳号 boar_ear_tag_no',
      '胎次 parity',
      '公仔数 male_born',
      '母仔数 female_born',
      '死胎数 stillborn_count',
      '木乃伊胎数 mummy_count',
      '畸形数 malformed_count',
      '弱仔数 weak_count',
      '断奶日期 wean_date',
      '断奶仔猪数 wean_count',
      '断奶窝重 wean_litter_weight_kg',
      '窝备注 remark',
      '初生重 birth_weight_kg',
      '左乳头数 left_teats',
      '右乳头数 right_teats',
      '断奶重 wean_weight_ind_kg',
      '个体备注 piglet_remark',
    ]);
    ws.getRow(1).font = { bold: true };

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: 'repro-template.xlsx',
      buffer: Buffer.from(out),
    };
  }

  private async generateCarcassTemplate(user: JwtPayload): Promise<FileResult> {
    void user;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('carcass');
    ws.addRow([
      '耳标号 ear_tag_no',
      '屠宰日期 slaughter_date',
      '宰前活重 pre_slaughter_weight_kg',
      '左胴体重 carcass_weight_left_kg',
      '右胴体重 carcass_weight_right_kg',
      '肋骨数 rib_count',
      '胴体长 carcass_length_cm',
      '体斜长 body_oblique_length_cm',
      '背膘(肩) backfat_shoulder_mm',
      '背膘(最后肋) backfat_last_rib_mm',
      '背膘(腰荐) backfat_lumbar_mm',
      '皮厚(6~7肋) skin_thickness_6_7_rib_mm',
      '眼肌面积 ema_last_rib_cm2',
      '眼肌高 ema_height_cm',
      '眼肌宽 ema_width_cm',
      '皮重(kg) left_detach_skin_kg',
      '骨重(kg) left_detach_bone_kg',
      '肥肉重(kg) left_detach_fat_kg',
      '瘦肉重(kg) left_detach_lean_kg',
      '左腿臀重(kg) left_leg_weight_kg',
      '蹄重(kg) hoof_weight_kg',
      '头重(kg) head_weight_kg',
      '备注 remark',
    ]);
    ws.getRow(1).font = { bold: true };

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: 'carcass-template.xlsx',
      buffer: Buffer.from(out),
    };
  }

  private async generateMeatqTemplate(user: JwtPayload): Promise<FileResult> {
    void user;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('meatq');
    ws.addRow([
      '耳标号 ear_tag_no',
      '肉色评分 color_score',
      'L* color_l',
      'a* color_a',
      'b* color_b',
      'pH(1h) ph_1h',
      'pH(24h) ph_24h',
      '滴水损失(%) drip_loss_pct',
      '系水力(%) water_holding_pct',
      '大理石纹评分 marbling_score',
      '肌内脂肪(%) imf_pct',
      '肌间脂肪(%) imp_pct',
      '水分(%) moisture_pct',
      '嫩度剪切力(N) tenderness_shear_n',
      '熟肉率(%) cooked_meat_rate',
      '备注 remark',
    ]);
    ws.getRow(1).font = { bold: true };

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: 'meatq-template.xlsx',
      buffer: Buffer.from(out),
    };
  }

  private async generateBaseInfoTemplate(user: JwtPayload): Promise<FileResult> {
    void user;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('base_info');
    ws.addRow([
      '名称 name',
      '级别 level',
      '编号 code',
      '地址 address',
      '负责人 principal',
      '电话 phone',
      '邮箱 email',
      '畜禽养殖场代码 farmCode',
      '专业技术人员数量 technicianCount',
      '技术负责人 technicalPrincipal',
      '学历或职称 technicalTitleOrDegree',
      '保护品种名称 protectedBreedName',
      '存栏数量 inStockCount',
      '家系数量 familyCount',
      '种畜数量 breedingCount',
      '种公畜数量 breedingMaleCount',
      '基础母畜数量 breedingFemaleBaseCount',
      '后备畜群数量 reserveCount',
      '后备公畜数量 reserveMaleCount',
      '后备母畜数量 reserveFemaleCount',
      '占地面积(㎡) landAreaM2',
      '畜舍面积(㎡) housingAreaM2',
      '固定资产(万元) fixedAssets10kCny',
      '填表人 filler',
      '联系方式 contact',
      '日期 fillDate',
    ]);
    ws.getRow(1).font = { bold: true };

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: 'base-info-template.xlsx',
      buffer: Buffer.from(out),
    };
  }

  private async exportPigs(
    user: JwtPayload,
    unitId?: string,
  ): Promise<FileResult> {
    const resolvedUnitId = this.resolveUnitIdForRead(user, unitId);
    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const qb = this.pigs
      .createQueryBuilder('p')
      .innerJoin(BreedEntity, 'b', 'b.id = p.breedId')
      .innerJoin(UnitEntity, 'u', 'u.id = p.unitId')
      .where('p.unitId = :unitId', { unitId: resolvedUnitId })
      .orderBy('p.id', 'DESC')
      .select([
        'p.earTagNo AS earTagNo',
        'p.individualNo AS individualNo',
        'b.name AS breedName',
        'u.name AS unitName',
        'p.sex AS sex',
        'p.birthDate AS birthDate',
        'p.damEarTagNo AS damEarTagNo',
        'p.remark AS remark',
      ]);

    const rows = await qb.getRawMany();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('pigs');
    ws.addRow([
      '耳标号 ear_tag_no',
      '个体号 individual_no',
      '品种 breed_name',
      '单位 unit_name',
      '性别 sex',
      '出生日期 birth_date',
      '母猪耳号 dam_ear_tag_no',
      '备注 remark',
    ]);
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      ws.addRow([
        r.earTagNo,
        r.individualNo ?? '',
        r.breedName,
        r.unitName,
        r.sex,
        r.birthDate,
        r.damEarTagNo ?? '',
        r.remark ?? '',
      ]);
    }

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: `pigs-export-unit-${unit.id}.xlsx`,
      buffer: Buffer.from(out),
    };
  }

  private async exportGrowth(
    user: JwtPayload,
    unitId?: string,
  ): Promise<FileResult> {
    const resolvedUnitId = this.resolveUnitIdForRead(user, unitId);
    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const qb = this.growth
      .createQueryBuilder('g')
      .innerJoin(PigEntity, 'p', 'p.id = g.pigId')
      .where('p.unitId = :unitId', { unitId: resolvedUnitId })
      .orderBy('g.id', 'DESC')
      .select([
        'p.earTagNo AS earTagNo',
        'g.startDate AS startDate',
        'g.startWeightKg AS startWeightKg',
        'g.endDate AS endDate',
        'g.endWeightKg AS endWeightKg',
        'g.feedKg AS feedKg',
        'g.endBackfatMm AS endBackfatMm',
        'g.endEmaCm2 AS endEmaCm2',
        'g.remark AS remark',
        'g.startAgeDays AS startAgeDays',
        'g.endAgeDays AS endAgeDays',
        'g.testDays AS testDays',
        'g.adgG AS adgG',
        'g.adfiKg AS adfiKg',
        'g.fcr AS fcr',
        'g.dtswDays AS dtswDays',
      ]);

    const rows = await qb.getRawMany();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('growth');
    ws.addRow([
      '耳标号 ear_tag_no',
      '始测日期 start_date',
      '始测体重 start_weight_kg',
      '结测日期 end_date',
      '结测体重 end_weight_kg',
      '耗料 feed_kg',
      '结测背膘 end_backfat_mm',
      '结测眼肌面积 end_ema_cm2',
      '备注 remark',
      '始测日龄 start_age_days',
      '结测日龄 end_age_days',
      '测定天数 test_days',
      '日增重 adg_g',
      '日采食 adfi_kg',
      '料重比 fcr',
      '达100kg日龄 dtsw_days',
    ]);
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      ws.addRow([
        r.earTagNo,
        r.startDate ?? '',
        r.startWeightKg ?? '',
        r.endDate ?? '',
        r.endWeightKg ?? '',
        r.feedKg ?? '',
        r.endBackfatMm ?? '',
        r.endEmaCm2 ?? '',
        r.remark ?? '',
        r.startAgeDays ?? '',
        r.endAgeDays ?? '',
        r.testDays ?? '',
        r.adgG ?? '',
        r.adfiKg ?? '',
        r.fcr ?? '',
        r.dtswDays ?? '',
      ]);
    }

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: `growth-export-unit-${unit.id}.xlsx`,
      buffer: Buffer.from(out),
    };
  }

  private async exportRepro(
    user: JwtPayload,
    unitId?: string,
  ): Promise<FileResult> {
    const resolvedUnitId = this.resolveUnitIdForRead(user, unitId);
    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const qb = this.reproPiglets
      .createQueryBuilder('rp')
      .innerJoin(PigEntity, 'p', 'p.id = rp.pigId')
      .innerJoin(ReproLitterEntity, 'l', 'l.id = rp.litterId')
      .where('p.unitId = :unitId', { unitId: resolvedUnitId })
      .orderBy('rp.id', 'DESC')
      .select([
        'p.earTagNo AS earTagNo',
        'l.damEarTagNo AS damEarTagNo',
        'l.farrowingDate AS farrowingDate',
        'l.matingDate AS matingDate',
        'l.boarEarTagNo AS boarEarTagNo',
        'l.parity AS parity',
        'l.maleBorn AS maleBorn',
        'l.femaleBorn AS femaleBorn',
        'l.totalBorn AS totalBorn',
        'l.stillbornCount AS stillbornCount',
        'l.mummyCount AS mummyCount',
        'l.malformedCount AS malformedCount',
        'l.liveCount AS liveCount',
        'l.weakCount AS weakCount',
        'l.weanDate AS weanDate',
        'l.weanCount AS weanCount',
        'l.weanLitterWeightKg AS weanLitterWeightKg',
        'l.remark AS litterRemark',
        'rp.birthWeightKg AS birthWeightKg',
        'rp.leftTeats AS leftTeats',
        'rp.rightTeats AS rightTeats',
        'rp.weanWeightIndKg AS weanWeightIndKg',
        'rp.remark AS pigletRemark',
      ]);

    const rows = await qb.getRawMany();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('repro');
    ws.addRow([
      '耳标号 ear_tag_no',
      '母猪耳号 dam_ear_tag_no',
      '分娩日期 farrowing_date',
      '配种日期 mating_date',
      '公猪耳号 boar_ear_tag_no',
      '胎次 parity',
      '公仔数 male_born',
      '母仔数 female_born',
      '总产仔数 total_born',
      '死胎数 stillborn_count',
      '木乃伊胎数 mummy_count',
      '畸形数 malformed_count',
      '活仔数 live_count',
      '弱仔数 weak_count',
      '断奶日期 wean_date',
      '断奶仔猪数 wean_count',
      '断奶窝重 wean_litter_weight_kg',
      '窝备注 remark',
      '初生重 birth_weight_kg',
      '左乳头数 left_teats',
      '右乳头数 right_teats',
      '断奶重 wean_weight_ind_kg',
      '个体备注 piglet_remark',
    ]);
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      ws.addRow([
        r.earTagNo,
        r.damEarTagNo,
        r.farrowingDate,
        r.matingDate ?? '',
        r.boarEarTagNo ?? '',
        r.parity ?? '',
        r.maleBorn ?? '',
        r.femaleBorn ?? '',
        r.totalBorn ?? '',
        r.stillbornCount ?? '',
        r.mummyCount ?? '',
        r.malformedCount ?? '',
        r.liveCount ?? '',
        r.weakCount ?? '',
        r.weanDate ?? '',
        r.weanCount ?? '',
        r.weanLitterWeightKg ?? '',
        r.litterRemark ?? '',
        r.birthWeightKg ?? '',
        r.leftTeats ?? '',
        r.rightTeats ?? '',
        r.weanWeightIndKg ?? '',
        r.pigletRemark ?? '',
      ]);
    }

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: `repro-export-unit-${unit.id}.xlsx`,
      buffer: Buffer.from(out),
    };
  }

  private async exportCarcass(
    user: JwtPayload,
    unitId?: string,
  ): Promise<FileResult> {
    const resolvedUnitId = this.resolveUnitIdForRead(user, unitId);
    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const qb = this.carcass
      .createQueryBuilder('c')
      .innerJoin(PigEntity, 'p', 'p.id = c.pigId')
      .where('p.unitId = :unitId', { unitId: resolvedUnitId })
      .orderBy('c.id', 'DESC')
      .select([
        'p.earTagNo AS earTagNo',
        'p.sex AS pigSex',
        'c.slaughterDate AS slaughterDate',
        'c.preSlaughterWeightKg AS preSlaughterWeightKg',
        'c.carcassWeightLeftKg AS carcassWeightLeftKg',
        'c.carcassWeightRightKg AS carcassWeightRightKg',
        'c.ribCount AS ribCount',
        'c.carcassLengthCm AS carcassLengthCm',
        'c.bodyObliqueLengthCm AS bodyObliqueLengthCm',
        'c.backfatShoulderMm AS backfatShoulderMm',
        'c.backfatLastRibMm AS backfatLastRibMm',
        'c.backfatLumbarMm AS backfatLumbarMm',
        'c.skinThickness6_7RibMm AS skinThickness6_7RibMm',
        'c.emaLastRibCm2 AS emaLastRibCm2',
        'c.emaHeightCm AS emaHeightCm',
        'c.emaWidthCm AS emaWidthCm',
        'c.leftDetachSkinKg AS leftDetachSkinKg',
        'c.leftDetachBoneKg AS leftDetachBoneKg',
        'c.leftDetachFatKg AS leftDetachFatKg',
        'c.leftDetachLeanKg AS leftDetachLeanKg',
        'c.leftLegWeightKg AS leftLegWeightKg',
        'c.hoofWeightKg AS hoofWeightKg',
        'c.headWeightKg AS headWeightKg',
        'c.detachLossPct AS detachLossPct',
        'c.legHipRatioPct AS legHipRatioPct',
        'c.skinRatePct AS skinRatePct',
        'c.boneRatePct AS boneRatePct',
        'c.fatRatePct AS fatRatePct',
        'c.leanRatePct AS leanRatePct',
        'c.slaughterRatePct AS slaughterRatePct',
        'c.remark AS remark',
      ]);

    const rows = await qb.getRawMany();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('carcass');
    ws.addRow([
      '耳标号 ear_tag_no',
      '性别 sex',
      '屠宰日期 slaughter_date',
      '宰前活重 pre_slaughter_weight_kg',
      '左胴体重 carcass_weight_left_kg',
      '右胴体重 carcass_weight_right_kg',
      '肋骨数 rib_count',
      '胴体长 carcass_length_cm',
      '体斜长 body_oblique_length_cm',
      '背膘(肩) backfat_shoulder_mm',
      '背膘(最后肋) backfat_last_rib_mm',
      '背膘(腰荐) backfat_lumbar_mm',
      '皮厚(6~7肋) skin_thickness_6_7_rib_mm',
      '眼肌面积 ema_last_rib_cm2',
      '眼肌高 ema_height_cm',
      '眼肌宽 ema_width_cm',
      '皮重(kg) left_detach_skin_kg',
      '骨重(kg) left_detach_bone_kg',
      '肥肉重(kg) left_detach_fat_kg',
      '瘦肉重(kg) left_detach_lean_kg',
      '左腿臀重(kg) left_leg_weight_kg',
      '蹄重(kg) hoof_weight_kg',
      '头重(kg) head_weight_kg',
      '分割损耗(%) detach_loss_pct',
      '腿臀比例(%) leg_hip_ratio_pct',
      '皮率(%) skin_rate_pct',
      '骨率(%) bone_rate_pct',
      '肥肉率(%) fat_rate_pct',
      '瘦肉率(%) lean_rate_pct',
      '屠宰率(%) slaughter_rate_pct',
      '备注 remark',
    ]);
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      ws.addRow([
        r.earTagNo,
        r.pigSex ?? '',
        r.slaughterDate ?? '',
        r.preSlaughterWeightKg ?? '',
        r.carcassWeightLeftKg ?? '',
        r.carcassWeightRightKg ?? '',
        r.ribCount ?? '',
        r.carcassLengthCm ?? '',
        r.bodyObliqueLengthCm ?? '',
        r.backfatShoulderMm ?? '',
        r.backfatLastRibMm ?? '',
        r.backfatLumbarMm ?? '',
        r.skinThickness6_7RibMm ?? '',
        r.emaLastRibCm2 ?? '',
        r.emaHeightCm ?? '',
        r.emaWidthCm ?? '',
        r.leftDetachSkinKg ?? '',
        r.leftDetachBoneKg ?? '',
        r.leftDetachFatKg ?? '',
        r.leftDetachLeanKg ?? '',
        r.leftLegWeightKg ?? '',
        r.hoofWeightKg ?? '',
        r.headWeightKg ?? '',
        r.detachLossPct ?? '',
        r.legHipRatioPct ?? '',
        r.skinRatePct ?? '',
        r.boneRatePct ?? '',
        r.fatRatePct ?? '',
        r.leanRatePct ?? '',
        r.slaughterRatePct ?? '',
        r.remark ?? '',
      ]);
    }

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: `carcass-export-unit-${unit.id}.xlsx`,
      buffer: Buffer.from(out),
    };
  }

  private async exportMeatq(user: JwtPayload, unitId?: string): Promise<FileResult> {
    const resolvedUnitId = this.resolveUnitIdForRead(user, unitId);
    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const qb = this.meatq
      .createQueryBuilder('m')
      .innerJoin(PigEntity, 'p', 'p.id = m.pigId')
      .where('p.unitId = :unitId', { unitId: resolvedUnitId })
      .orderBy('m.id', 'DESC')
      .select([
        'p.earTagNo AS earTagNo',
        'p.sex AS pigSex',
        'm.sex AS sex',
        'm.colorScore AS colorScore',
        'm.colorL AS colorL',
        'm.colorA AS colorA',
        'm.colorB AS colorB',
        'm.ph1h AS ph1h',
        'm.ph24h AS ph24h',
        'm.dripLossPct AS dripLossPct',
        'm.waterHoldingPct AS waterHoldingPct',
        'm.marblingScore AS marblingScore',
        'm.imfPct AS imfPct',
        'm.impPct AS impPct',
        'm.moisturePct AS moisturePct',
        'm.tendernessShearN AS tendernessShearN',
        'm.cookedMeatRate AS cookedMeatRate',
        'm.remark AS remark',
      ]);

    const rows = await qb.getRawMany();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('meatq');
    ws.addRow([
      '耳标号 ear_tag_no',
      '性别 sex',
      '肉色评分 color_score',
      'L* color_l',
      'a* color_a',
      'b* color_b',
      'pH(1h) ph_1h',
      'pH(24h) ph_24h',
      '滴水损失(%) drip_loss_pct',
      '系水力(%) water_holding_pct',
      '大理石纹评分 marbling_score',
      '肌内脂肪(%) imf_pct',
      '肌间脂肪(%) imp_pct',
      '水分(%) moisture_pct',
      '嫩度剪切力(N) tenderness_shear_n',
      '熟肉率(%) cooked_meat_rate',
      '备注 remark',
      'warnings',
    ]);
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      const tmp = this.meatq.create({
        pigId: 0,
        sex: r.sex ?? null,
        colorScore: r.colorScore ?? null,
        colorL: r.colorL ?? null,
        colorA: r.colorA ?? null,
        colorB: r.colorB ?? null,
        ph1h: r.ph1h ?? null,
        ph24h: r.ph24h ?? null,
        dripLossPct: r.dripLossPct ?? null,
        waterHoldingPct: r.waterHoldingPct ?? null,
        marblingScore: r.marblingScore ?? null,
        imfPct: r.imfPct ?? null,
        impPct: r.impPct ?? null,
        moisturePct: r.moisturePct ?? null,
        tendernessShearN: r.tendernessShearN ?? null,
        cookedMeatRate: r.cookedMeatRate ?? null,
        remark: r.remark ?? null,
      });
      const warnings = computeMeatqWarnings(tmp).join('；');

      ws.addRow([
        r.earTagNo,
        r.sex ?? r.pigSex ?? '',
        r.colorScore ?? '',
        r.colorL ?? '',
        r.colorA ?? '',
        r.colorB ?? '',
        r.ph1h ?? '',
        r.ph24h ?? '',
        r.dripLossPct ?? '',
        r.waterHoldingPct ?? '',
        r.marblingScore ?? '',
        r.imfPct ?? '',
        r.impPct ?? '',
        r.moisturePct ?? '',
        r.tendernessShearN ?? '',
        r.cookedMeatRate ?? '',
        r.remark ?? '',
        warnings,
      ]);
    }

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: `meatq-export-unit-${unit.id}.xlsx`,
      buffer: Buffer.from(out),
    };
  }

  private async exportBaseInfo(
    user: JwtPayload,
    unitId: string | undefined,
    year: string | undefined,
  ): Promise<FileResult> {
    const resolvedUnitId = this.resolveUnitIdForRead(user, unitId);
    const resolvedYear = this.parseYear(year);
    if (resolvedYear == null) throw new BadRequestException('year必填');

    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const record = await this.baseInfo.findOne({
      where: { unitId: resolvedUnitId, year: resolvedYear },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('base_info');
    ws.addRow([
      '名称 name',
      '级别 level',
      '编号 code',
      '地址 address',
      '负责人 principal',
      '电话 phone',
      '邮箱 email',
      '畜禽养殖场代码 farmCode',
      '专业技术人员数量 technicianCount',
      '技术负责人 technicalPrincipal',
      '学历或职称 technicalTitleOrDegree',
      '保护品种名称 protectedBreedName',
      '存栏数量 inStockCount',
      '家系数量 familyCount',
      '种畜数量 breedingCount',
      '种公畜数量 breedingMaleCount',
      '基础母畜数量 breedingFemaleBaseCount',
      '后备畜群数量 reserveCount',
      '后备公畜数量 reserveMaleCount',
      '后备母畜数量 reserveFemaleCount',
      '占地面积(㎡) landAreaM2',
      '畜舍面积(㎡) housingAreaM2',
      '固定资产(万元) fixedAssets10kCny',
      '填表人 filler',
      '联系方式 contact',
      '日期 fillDate',
    ]);
    ws.getRow(1).font = { bold: true };

    if (record) {
      const data = (record.data ?? {}) as Record<string, any>;
      ws.addRow([
        data.name ?? '',
        data.level ?? '',
        data.code ?? '',
        data.address ?? '',
        data.principal ?? '',
        data.phone ?? '',
        data.email ?? '',
        data.farmCode ?? '',
        data.technicianCount ?? '',
        data.technicalPrincipal ?? '',
        data.technicalTitleOrDegree ?? '',
        data.protectedBreedName ?? '',
        data.inStockCount ?? '',
        data.familyCount ?? '',
        data.breedingCount ?? '',
        data.breedingMaleCount ?? '',
        data.breedingFemaleBaseCount ?? '',
        data.reserveCount ?? '',
        data.reserveMaleCount ?? '',
        data.reserveFemaleCount ?? '',
        data.landAreaM2 ?? '',
        data.housingAreaM2 ?? '',
        data.fixedAssets10kCny ?? '',
        data.filler ?? '',
        data.contact ?? '',
        record.fillDate ?? data.fillDate ?? '',
      ]);
    }

    const out = await wb.xlsx.writeBuffer();
    return {
      filename: `base-info-export-unit-${unit.id}-year-${resolvedYear}.xlsx`,
      buffer: Buffer.from(out),
    };
  }

  private async validatePigs(
    user: JwtPayload,
    unitId: string | undefined,
    year: string | undefined,
    filename: string,
    buffer: Buffer,
  ) {
    void user;
    const resolvedUnitId = this.resolveUnitIdForImport(unitId);
    const resolvedYear = this.parseYear(year);
    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('xlsx为空');

    const requiredKeys = [
      'ear_tag_no',
      'breed_name',
      'sex',
      'birth_date',
    ] as const;
    const allKeys = [
      'ear_tag_no',
      'individual_no',
      'breed_name',
      'sex',
      'birth_date',
      'dam_ear_tag_no',
      'remark',
    ] as const;

    const colIndexByKey = this.mapHeaders(sheet.getRow(1), {
      ear_tag_no: ['耳标号ear_tag_no', '耳标号', 'ear_tag_no'],
      individual_no: ['个体号individual_no', '个体号', 'individual_no'],
      breed_name: ['品种breed_name', '品种', 'breed_name'],
      sex: ['性别sex', '性别', 'sex'],
      birth_date: ['出生日期birth_date', '出生日期', 'birth_date'],
      dam_ear_tag_no: ['母猪耳号dam_ear_tag_no', '母猪耳号', 'dam_ear_tag_no'],
      remark: ['备注remark', '备注', 'remark'],
    });

    for (const k of requiredKeys) {
      if (!colIndexByKey[k]) throw new BadRequestException(`缺少表头列: ${k}`);
    }

    const breeds = await this.breeds.find();
    const breedIdByName = new Map(
      breeds.map((b) => [this.normalizeText(b.name), b.id] as const),
    );

    const errors: RowError[] = [];
    const payloadRows: PigsPayloadRow[] = [];
    const earTagRowNo = new Map<string, number>();
    const earTagRowNos = new Map<string, number[]>();
    let totalRows = 0;

    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
      const row = sheet.getRow(rowNo);
      const values = allKeys.map((k) =>
        this.getCellValue(row, colIndexByKey[k]),
      );
      const hasAny = values.some((v) => !this.isEmptyCell(v));
      if (!hasAny) continue;
      totalRows++;

      const rowErrors: RowError[] = [];

      const rawEarTagNo = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.ear_tag_no),
      );
      const earTagNo = rawEarTagNo?.trim() ?? '';
      if (!earTagNo) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'ear_tag_no',
          message: '耳标号必填',
        });
      } else {
        const normalizedEar = earTagNo.trim();
        if (earTagRowNo.has(normalizedEar)) {
          rowErrors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号在文件内重复',
          });
        } else {
          earTagRowNo.set(normalizedEar, rowNo);
        }
        const list = earTagRowNos.get(normalizedEar) ?? [];
        list.push(rowNo);
        earTagRowNos.set(normalizedEar, list);
      }

      const rawBreedName = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.breed_name),
      );
      const breedName = rawBreedName?.trim() ?? '';
      let breedId: number | null = null;
      if (!breedName) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'breed_name',
          message: '品种必填',
        });
      } else {
        breedId = breedIdByName.get(this.normalizeText(breedName)) ?? null;
        if (!breedId) {
          rowErrors.push({
            rowNumber: rowNo,
            field: 'breed_name',
            message: '品种无法识别',
          });
        }
      }

      const sexRaw = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.sex),
      );
      const sex = this.parseSex(sexRaw);
      if (!sex) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'sex',
          message: '性别不正确',
        });
      }

      const birthRaw = this.getCellValue(row, colIndexByKey.birth_date);
      const birthDate = this.parseDateCell(birthRaw);
      if (!birthDate) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'birth_date',
          message: '出生日期格式应为YYYY-MM-DD',
        });
      }

      const individualNo = this.normalizeOptionalString(
        this.parseStringCell(
          this.getCellValue(row, colIndexByKey.individual_no),
        ),
      );
      const damEarTagNo = this.normalizeOptionalString(
        this.parseStringCell(
          this.getCellValue(row, colIndexByKey.dam_ear_tag_no),
        ),
      );
      const remark = this.normalizeOptionalString(
        this.parseStringCell(this.getCellValue(row, colIndexByKey.remark)),
      );

      if (rowErrors.length === 0) {
        payloadRows.push({
          earTagNo,
          individualNo,
          breedId: breedId!,
          sex: sex!,
          birthDate: birthDate!,
          damEarTagNo,
          remark,
        });
      }

      errors.push(...rowErrors);
    }

    const earTags = [...earTagRowNos.keys()];
    if (earTags.length > 0) {
      const existing = await this.pigs
        .createQueryBuilder('p')
        .select(['p.earTagNo'])
        .where('p.earTagNo IN (:...earTags)', { earTags })
        .getMany();

      for (const e of existing) {
        const rowNos = earTagRowNos.get(e.earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号已存在',
          });
        }
      }
    }

    const warnings: string[] = [];
    const errorRows = this.countErroredRows(errors);
    const summary: ImportSummary = {
      totalRows,
      validRows: Math.max(totalRows - errorRows, 0),
      errorRows,
      warningsCount: warnings.length,
    };

    const payload: PigsPayload = { rows: payloadRows };
    const batch = await this.batches.save(
      this.batches.create({
        unitId: resolvedUnitId,
        userId: user.sub,
        module: 'pigs',
        year: resolvedYear,
        status: 'validated' as ImportBatchStatus,
        filename: filename.slice(0, 200),
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        errorRows: summary.errorRows,
        warningsCount: warnings.length,
        payloadJson: payload as unknown as Record<string, unknown>,
      }),
    );

    if (errors.length > 0) {
      await this.rowErrors.save(
        errors.map((e) =>
          this.rowErrors.create({
            batchId: batch.id,
            rowNumber: e.rowNumber,
            field: e.field,
            message: e.message,
          }),
        ),
      );
    }

    return {
      batchId: batch.id,
      summary,
      errors: errors.sort((a, b) =>
        a.rowNumber === b.rowNumber
          ? String(a.field ?? '').localeCompare(String(b.field ?? ''))
          : a.rowNumber - b.rowNumber,
      ),
      warnings,
    };
  }

  private async validateGrowth(
    user: JwtPayload,
    unitId: string | undefined,
    year: string | undefined,
    filename: string,
    buffer: Buffer,
  ) {
    void user;
    const resolvedUnitId = this.resolveUnitIdForImport(unitId);
    const resolvedYear = this.parseYear(year);
    void resolvedYear;

    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('xlsx为空');

    const baseKeys = [
      'ear_tag_no',
      'start_date',
      'start_weight_kg',
      'end_date',
      'end_weight_kg',
      'feed_kg',
      'end_backfat_mm',
      'end_ema_cm2',
      'remark',
    ] as const;

    const derivedKeys = [
      'start_age_days',
      'end_age_days',
      'test_days',
      'adg_g',
      'adfi_kg',
      'fcr',
      'dtsw_days',
    ] as const;

    const allKeys = [...baseKeys, ...derivedKeys] as const;

    const colIndexByKey = this.mapHeaders(sheet.getRow(1), {
      ear_tag_no: ['耳标号ear_tag_no', '耳标号', 'ear_tag_no'],
      start_date: ['始测日期start_date', '始测日期', 'start_date'],
      start_weight_kg: ['始测体重start_weight_kg', '始测体重', 'start_weight_kg'],
      end_date: ['结测日期end_date', '结测日期', 'end_date'],
      end_weight_kg: ['结测体重end_weight_kg', '结测体重', 'end_weight_kg'],
      feed_kg: ['耗料feed_kg', '耗料', 'feed_kg'],
      end_backfat_mm: ['结测背膘end_backfat_mm', '结测背膘', 'end_backfat_mm'],
      end_ema_cm2: ['结测眼肌面积end_ema_cm2', '结测眼肌面积', 'end_ema_cm2'],
      remark: ['备注remark', '备注', 'remark'],
      start_age_days: ['始测日龄start_age_days', '始测日龄', 'start_age_days'],
      end_age_days: ['结测日龄end_age_days', '结测日龄', 'end_age_days'],
      test_days: ['测定天数test_days', '测定天数', 'test_days'],
      adg_g: ['日增重adg_g', '日增重', 'adg_g'],
      adfi_kg: ['日采食adfi_kg', '日采食', 'adfi_kg'],
      fcr: ['料重比fcr', '料重比', 'fcr'],
      dtsw_days: ['达100kg日龄dtsw_days', '达100kg日龄', 'dtsw_days'],
    });

    if (!colIndexByKey.ear_tag_no)
      throw new BadRequestException('缺少表头列: ear_tag_no');

    const errors: RowError[] = [];
    const warnings: string[] = [];
    const payloadRows: GrowthPayloadRow[] = [];

    const earTagRowNo = new Map<string, number>();
    const earTagRowNos = new Map<string, number[]>();
    let totalRows = 0;

    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
      const row = sheet.getRow(rowNo);
      const values = allKeys.map((k) =>
        this.getCellValue(row, colIndexByKey[k]),
      );
      const hasAny = values.some((v) => !this.isEmptyCell(v));
      if (!hasAny) continue;
      totalRows++;

      const rowErrors: RowError[] = [];

      const rawEarTagNo = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.ear_tag_no),
      );
      const earTagNo = rawEarTagNo?.trim() ?? '';
      if (!earTagNo) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'ear_tag_no',
          message: '耳标号必填',
        });
      } else {
        const normalizedEar = earTagNo.trim();
        if (earTagRowNo.has(normalizedEar)) {
          rowErrors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号在文件内重复',
          });
        } else {
          earTagRowNo.set(normalizedEar, rowNo);
        }
        const list = earTagRowNos.get(normalizedEar) ?? [];
        list.push(rowNo);
        earTagRowNos.set(normalizedEar, list);
      }

      const startDate = this.parseDateOrNull(
        this.getCellValue(row, colIndexByKey.start_date),
      );
      if (startDate === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'start_date',
          message: '始测日期格式应为YYYY-MM-DD',
        });
      }

      const endDate = this.parseDateOrNull(
        this.getCellValue(row, colIndexByKey.end_date),
      );
      if (endDate === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'end_date',
          message: '结测日期格式应为YYYY-MM-DD',
        });
      }

      const startWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.start_weight_kg),
      );
      if (startWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'start_weight_kg',
          message: '始测体重格式不正确',
        });
      }

      const endWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.end_weight_kg),
      );
      if (endWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'end_weight_kg',
          message: '结测体重格式不正确',
        });
      }

      const feedKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.feed_kg),
      );
      if (feedKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'feed_kg',
          message: '耗料格式不正确',
        });
      }

      const endBackfatMm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.end_backfat_mm),
      );
      if (endBackfatMm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'end_backfat_mm',
          message: '结测背膘格式不正确',
        });
      }

      const endEmaCm2 = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.end_ema_cm2),
      );
      if (endEmaCm2 === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'end_ema_cm2',
          message: '结测眼肌面积格式不正确',
        });
      }

      const remark = this.normalizeOptionalString(
        this.parseStringCell(this.getCellValue(row, colIndexByKey.remark)),
      );

      errors.push(...rowErrors);

      if (rowErrors.length === 0) {
        payloadRows.push({
          pigId: 0,
          startDate: startDate ?? null,
          startWeightKg: startWeightKg ?? null,
          endDate: endDate ?? null,
          endWeightKg: endWeightKg ?? null,
          feedKg: feedKg ?? null,
          endBackfatMm: endBackfatMm ?? null,
          endEmaCm2: endEmaCm2 ?? null,
          remark,
          startAgeDays: null,
          endAgeDays: null,
          testDays: null,
          adgG: null,
          adfiKg: null,
          fcr: null,
          dtswDays: null,
        });
      }
    }

    const earTags = [...earTagRowNos.keys()];
    const pigByEar = new Map<string, PigEntity>();
    if (earTags.length > 0) {
      const pigs = await this.pigs
        .createQueryBuilder('p')
        .where('p.unitId = :unitId', { unitId: resolvedUnitId })
        .andWhere('p.earTagNo IN (:...earTags)', { earTags })
        .getMany();
      for (const p of pigs) pigByEar.set(p.earTagNo, p);

      for (const earTagNo of earTags) {
        if (pigByEar.has(earTagNo)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号不存在或不属于该单位',
          });
        }
      }
    }

    const breedNameById = new Map<number, string>();
    const breeds = await this.breeds.find();
    for (const b of breeds) breedNameById.set(b.id, b.name);

    const pigIds: number[] = [];
    for (const earTagNo of earTags) {
      const p = pigByEar.get(earTagNo);
      if (p) pigIds.push(p.id);
    }

    if (pigIds.length > 0) {
      const existing = await this.growth
        .createQueryBuilder('g')
        .select(['g.pigId'])
        .where('g.pigId IN (:...pigIds)', { pigIds })
        .getMany();
      const existingSet = new Set(existing.map((e) => e.pigId));
      for (const earTagNo of earTags) {
        const p = pigByEar.get(earTagNo);
        if (!p) continue;
        if (!existingSet.has(p.id)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: 'growth记录已存在',
          });
        }
      }
    }

    const errorRows = this.countErroredRows(errors);
    const summary: ImportSummary = {
      totalRows,
      validRows: Math.max(totalRows - errorRows, 0),
      errorRows,
      warningsCount: 0,
    };

    if (errors.length === 0 && payloadRows.length > 0) {
      const orderedEarTags = earTags.filter((e) => earTagRowNo.has(e));
      for (let i = 0; i < orderedEarTags.length; i++) {
        const earTagNo = orderedEarTags[i]!;
        const p = pigByEar.get(earTagNo);
        if (!p) continue;
        const rowNo = earTagRowNo.get(earTagNo)!;
        const payload = payloadRows[i]!;

        const breedName = breedNameById.get(p.breedId) ?? '';
        const targetWeightKg =
          (DEFAULT_DTSW_TARGET_WEIGHT_KG_BY_BREED_NAME as any)[breedName] ?? null;

        const computed = this.computeGrowthDerived(
          p.birthDate,
          payload.startDate,
          payload.startWeightKg,
          payload.endDate,
          payload.endWeightKg,
          payload.feedKg,
          targetWeightKg,
        );

        payloadRows[i] = {
          ...payload,
          pigId: p.id,
          ...computed,
        };

        const diffs = this.compareGrowthDerivedWithSheet(
          sheet.getRow(rowNo),
          colIndexByKey,
          computed,
        );
        warnings.push(...diffs.map((d) => `行 ${rowNo}：${d}`));
      }
    }

    summary.warningsCount = warnings.length;

    const payload: GrowthPayload = { rows: payloadRows.filter((r) => r.pigId) };
    const batch = await this.batches.save(
      this.batches.create({
        unitId: resolvedUnitId,
        userId: user.sub,
        module: 'growth',
        year: null,
        status: 'validated' as ImportBatchStatus,
        filename: filename.slice(0, 200),
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        errorRows: summary.errorRows,
        warningsCount: warnings.length,
        payloadJson: payload as unknown as Record<string, unknown>,
      }),
    );

    if (errors.length > 0) {
      await this.rowErrors.save(
        errors.map((e) =>
          this.rowErrors.create({
            batchId: batch.id,
            rowNumber: e.rowNumber,
            field: e.field,
            message: e.message,
          }),
        ),
      );
    }

    return {
      batchId: batch.id,
      summary,
      errors: errors.sort((a, b) =>
        a.rowNumber === b.rowNumber
          ? String(a.field ?? '').localeCompare(String(b.field ?? ''))
          : a.rowNumber - b.rowNumber,
      ),
      warnings,
    };
  }

  private async validateRepro(
    user: JwtPayload,
    unitId: string | undefined,
    year: string | undefined,
    filename: string,
    buffer: Buffer,
  ) {
    void user;
    const resolvedUnitId = this.resolveUnitIdForImport(unitId);
    const resolvedYear = this.parseYear(year);
    void resolvedYear;

    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('xlsx为空');

    const requiredKeys = ['ear_tag_no', 'dam_ear_tag_no', 'farrowing_date'] as const;
    const allKeys = [
      'ear_tag_no',
      'dam_ear_tag_no',
      'farrowing_date',
      'mating_date',
      'boar_ear_tag_no',
      'parity',
      'male_born',
      'female_born',
      'stillborn_count',
      'mummy_count',
      'malformed_count',
      'weak_count',
      'wean_date',
      'wean_count',
      'wean_litter_weight_kg',
      'remark',
      'birth_weight_kg',
      'left_teats',
      'right_teats',
      'wean_weight_ind_kg',
      'piglet_remark',
      'total_born',
      'live_count',
    ] as const;

    const colIndexByKey = this.mapHeaders(sheet.getRow(1), {
      ear_tag_no: ['耳标号ear_tag_no', '耳标号', 'ear_tag_no'],
      dam_ear_tag_no: ['母猪耳号dam_ear_tag_no', '母猪耳号', 'dam_ear_tag_no'],
      farrowing_date: ['分娩日期farrowing_date', '分娩日期', 'farrowing_date'],
      mating_date: ['配种日期mating_date', '配种日期', 'mating_date'],
      boar_ear_tag_no: ['公猪耳号boar_ear_tag_no', '公猪耳号', 'boar_ear_tag_no'],
      parity: ['胎次parity', '胎次', 'parity'],
      male_born: ['公仔数male_born', '公仔数', 'male_born'],
      female_born: ['母仔数female_born', '母仔数', 'female_born'],
      stillborn_count: ['死胎数stillborn_count', '死胎数', 'stillborn_count'],
      mummy_count: ['木乃伊胎数mummy_count', '木乃伊胎数', 'mummy_count'],
      malformed_count: ['畸形数malformed_count', '畸形数', 'malformed_count'],
      weak_count: ['弱仔数weak_count', '弱仔数', 'weak_count'],
      wean_date: ['断奶日期wean_date', '断奶日期', 'wean_date'],
      wean_count: ['断奶仔猪数wean_count', '断奶仔猪数', 'wean_count'],
      wean_litter_weight_kg: [
        '断奶窝重wean_litter_weight_kg',
        '断奶窝重',
        'wean_litter_weight_kg',
      ],
      remark: ['窝备注remark', '窝备注', 'remark', 'litter_remark'],
      birth_weight_kg: ['初生重birth_weight_kg', '初生重', 'birth_weight_kg'],
      left_teats: ['左乳头数left_teats', '左乳头数', 'left_teats'],
      right_teats: ['右乳头数right_teats', '右乳头数', 'right_teats'],
      wean_weight_ind_kg: ['断奶重wean_weight_ind_kg', '断奶重', 'wean_weight_ind_kg'],
      piglet_remark: ['个体备注piglet_remark', '个体备注', 'piglet_remark', 'piglet_remark'],
      total_born: ['总产仔数total_born', '总产仔数', 'total_born'],
      live_count: ['活仔数live_count', '活仔数', 'live_count'],
    });

    for (const k of requiredKeys) {
      if (!colIndexByKey[k]) throw new BadRequestException(`缺少表头列: ${k}`);
    }

    const errors: RowError[] = [];
    const warnings: string[] = [];

    type ParsedRow = {
      rowNumber: number;
      earTagNo: string;
      damEarTagNo: string;
      farrowingDate: string;
      litter: ReproLitterGroup['litter'];
      piglet: {
        birthWeightKg: number | null;
        leftTeats: number | null;
        rightTeats: number | null;
        weanWeightIndKg: number | null;
        remark: string | null;
      };
    };

    const rows: ParsedRow[] = [];
    const earTagRowNo = new Map<string, number>();
    const earTagRowNos = new Map<string, number[]>();
    let totalRows = 0;

    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
      const row = sheet.getRow(rowNo);
      const values = allKeys.map((k) =>
        this.getCellValue(row, colIndexByKey[k]),
      );
      const hasAny = values.some((v) => !this.isEmptyCell(v));
      if (!hasAny) continue;
      totalRows++;

      const rowErrors: RowError[] = [];

      const rawEarTagNo = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.ear_tag_no),
      );
      const earTagNo = rawEarTagNo?.trim() ?? '';
      if (!earTagNo) {
        rowErrors.push({ rowNumber: rowNo, field: 'ear_tag_no', message: '耳标号必填' });
      } else {
        const normalizedEar = earTagNo.trim();
        if (earTagRowNo.has(normalizedEar)) {
          rowErrors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号在文件内重复',
          });
        } else {
          earTagRowNo.set(normalizedEar, rowNo);
        }
        const list = earTagRowNos.get(normalizedEar) ?? [];
        list.push(rowNo);
        earTagRowNos.set(normalizedEar, list);
      }

      const rawDam = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.dam_ear_tag_no),
      );
      const damEarTagNo = rawDam?.trim() ?? '';
      if (!damEarTagNo) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'dam_ear_tag_no',
          message: '母猪耳号必填',
        });
      }

      const farrowingRaw = this.getCellValue(row, colIndexByKey.farrowing_date);
      let farrowingDate: string | null | undefined = null;
      if (this.isEmptyCell(farrowingRaw)) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'farrowing_date',
          message: '分娩日期必填',
        });
      } else {
        farrowingDate = this.parseDateOrNull(farrowingRaw);
        if (farrowingDate === undefined) {
          rowErrors.push({
            rowNumber: rowNo,
            field: 'farrowing_date',
            message: '分娩日期格式应为YYYY-MM-DD',
          });
        }
      }

      const matingDate = this.parseDateOrNull(
        this.getCellValue(row, colIndexByKey.mating_date),
      );
      if (matingDate === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'mating_date',
          message: '配种日期格式应为YYYY-MM-DD',
        });
      }

      const boarEarTagNo = this.normalizeOptionalString(
        this.parseStringCell(this.getCellValue(row, colIndexByKey.boar_ear_tag_no)),
      );

      const parity = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.parity),
      );
      if (parity === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'parity',
          message: '胎次格式不正确',
        });
      }

      const maleBorn = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.male_born),
      );
      if (maleBorn === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'male_born',
          message: '公仔数格式不正确',
        });
      }

      const femaleBorn = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.female_born),
      );
      if (femaleBorn === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'female_born',
          message: '母仔数格式不正确',
        });
      }

      const stillbornCount = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.stillborn_count),
      );
      if (stillbornCount === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'stillborn_count',
          message: '死胎数格式不正确',
        });
      }

      const mummyCount = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.mummy_count),
      );
      if (mummyCount === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'mummy_count',
          message: '木乃伊胎数格式不正确',
        });
      }

      const malformedCount = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.malformed_count),
      );
      if (malformedCount === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'malformed_count',
          message: '畸形数格式不正确',
        });
      }

      const weakCount = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.weak_count),
      );
      if (weakCount === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'weak_count',
          message: '弱仔数格式不正确',
        });
      }

      const weanDate = this.parseDateOrNull(
        this.getCellValue(row, colIndexByKey.wean_date),
      );
      if (weanDate === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'wean_date',
          message: '断奶日期格式应为YYYY-MM-DD',
        });
      }

      const weanCount = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.wean_count),
      );
      if (weanCount === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'wean_count',
          message: '断奶仔猪数格式不正确',
        });
      }

      const weanLitterWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.wean_litter_weight_kg),
      );
      if (weanLitterWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'wean_litter_weight_kg',
          message: '断奶窝重格式不正确',
        });
      }

      const litterRemark = this.normalizeOptionalString(
        this.parseStringCell(this.getCellValue(row, colIndexByKey.remark)),
      );

      const birthWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.birth_weight_kg),
      );
      if (birthWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'birth_weight_kg',
          message: '初生重格式不正确',
        });
      }

      const leftTeats = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.left_teats),
      );
      if (leftTeats === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'left_teats',
          message: '左乳头数格式不正确',
        });
      }

      const rightTeats = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.right_teats),
      );
      if (rightTeats === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'right_teats',
          message: '右乳头数格式不正确',
        });
      }

      const weanWeightIndKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.wean_weight_ind_kg),
      );
      if (weanWeightIndKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'wean_weight_ind_kg',
          message: '断奶重格式不正确',
        });
      }

      const pigletRemark = this.normalizeOptionalString(
        this.parseStringCell(this.getCellValue(row, colIndexByKey.piglet_remark)),
      );

      errors.push(...rowErrors);

      if (rowErrors.length === 0 && farrowingDate) {
        rows.push({
          rowNumber: rowNo,
          earTagNo,
          damEarTagNo,
          farrowingDate,
          litter: {
            boarEarTagNo,
            matingDate: matingDate ?? null,
            parity: parity ?? null,
            maleBorn: maleBorn ?? null,
            femaleBorn: femaleBorn ?? null,
            stillbornCount: stillbornCount ?? null,
            mummyCount: mummyCount ?? null,
            malformedCount: malformedCount ?? null,
            weakCount: weakCount ?? null,
            weanDate: weanDate ?? null,
            weanCount: weanCount ?? null,
            weanLitterWeightKg: (weanLitterWeightKg ?? null) as number | null,
            remark: litterRemark,
          },
          piglet: {
            birthWeightKg: (birthWeightKg ?? null) as number | null,
            leftTeats: leftTeats ?? null,
            rightTeats: rightTeats ?? null,
            weanWeightIndKg: (weanWeightIndKg ?? null) as number | null,
            remark: pigletRemark,
          },
        });
      }
    }

    const rowsByLitterKey = new Map<string, ParsedRow[]>();
    for (const r of rows) {
      const key = `${this.normalizeText(r.damEarTagNo)}|${r.farrowingDate}`;
      const list = rowsByLitterKey.get(key) ?? [];
      list.push(r);
      rowsByLitterKey.set(key, list);
    }

    const conflictedLitterKeys = new Set<string>();
    for (const [key, list] of rowsByLitterKey.entries()) {
      if (list.length <= 1) continue;
      const base = list[0]!;
      for (let i = 1; i < list.length; i++) {
        const cur = list[i]!;
        if (!this.isSameReproLitterInput(base.litter, cur.litter)) {
          conflictedLitterKeys.add(key);
          break;
        }
      }
    }

    if (conflictedLitterKeys.size > 0) {
      for (const key of conflictedLitterKeys) {
        const list = rowsByLitterKey.get(key) ?? [];
        for (const r of list) {
          errors.push({
            rowNumber: r.rowNumber,
            field: null,
            message: '同一窝窝级字段不一致',
          });
        }
      }
    }

    const earTags = [...earTagRowNos.keys()];
    const pigByEar = new Map<string, PigEntity>();
    if (earTags.length > 0) {
      const pigs = await this.pigs
        .createQueryBuilder('p')
        .where('p.unitId = :unitId', { unitId: resolvedUnitId })
        .andWhere('p.earTagNo IN (:...earTags)', { earTags })
        .getMany();
      for (const p of pigs) pigByEar.set(p.earTagNo, p);

      for (const earTagNo of earTags) {
        if (pigByEar.has(earTagNo)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号不存在或不属于该单位',
          });
        }
      }
    }

    const pigIds: number[] = [];
    for (const earTagNo of earTags) {
      const p = pigByEar.get(earTagNo);
      if (p) pigIds.push(p.id);
    }

    if (pigIds.length > 0) {
      const existingPiglets = await this.reproPiglets
        .createQueryBuilder('rp')
        .select(['rp.pigId'])
        .where('rp.pigId IN (:...pigIds)', { pigIds })
        .getMany();
      const existingPigletSet = new Set(existingPiglets.map((e) => e.pigId));
      for (const earTagNo of earTags) {
        const p = pigByEar.get(earTagNo);
        if (!p) continue;
        if (!existingPigletSet.has(p.id)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: 'repro记录已存在',
          });
        }
      }
    }

    const dams = [...new Set(rows.map((r) => r.damEarTagNo))];
    const farrowingDates = [...new Set(rows.map((r) => r.farrowingDate))];
    const existingLitterByKey = new Map<string, ReproLitterEntity>();
    if (dams.length > 0 && farrowingDates.length > 0) {
      const existing = await this.reproLitters
        .createQueryBuilder('l')
        .where('l.damEarTagNo IN (:...dams)', { dams })
        .andWhere('l.farrowingDate IN (:...dates)', { dates: farrowingDates })
        .getMany();
      for (const l of existing) {
        const key = `${this.normalizeText(l.damEarTagNo)}|${l.farrowingDate}`;
        existingLitterByKey.set(key, l);
      }
    }

    for (const [key, list] of rowsByLitterKey.entries()) {
      if (conflictedLitterKeys.has(key)) continue;
      const base = list[0]!;
      const expected = this.computeReproLitterExpected(base.litter);
      if (expected.error) {
        for (const r of list) {
          errors.push({
            rowNumber: r.rowNumber,
            field: expected.error.field,
            message: expected.error.message,
          });
        }
        continue;
      }

      const existing = existingLitterByKey.get(key) ?? null;
      if (!existing) continue;

      if (existing.unitId !== resolvedUnitId) {
        for (const r of list) {
          errors.push({
            rowNumber: r.rowNumber,
            field: null,
            message: '同一窝已存在但所属单位不一致',
          });
        }
        continue;
      }

      const incoming: Partial<ReproLitterEntity> = {
        damEarTagNo: base.damEarTagNo,
        farrowingDate: base.farrowingDate,
        boarEarTagNo: base.litter.boarEarTagNo,
        matingDate: base.litter.matingDate,
        parity: base.litter.parity,
        maleBorn: base.litter.maleBorn,
        femaleBorn: base.litter.femaleBorn,
        totalBorn: expected.computed.totalBorn,
        stillbornCount: base.litter.stillbornCount,
        mummyCount: base.litter.mummyCount,
        malformedCount: base.litter.malformedCount,
        liveCount: expected.computed.liveCount,
        weakCount: base.litter.weakCount,
        weanDate: base.litter.weanDate,
        weanCount: base.litter.weanCount,
        weanLitterWeightKg: base.litter.weanLitterWeightKg,
        remark: base.litter.remark,
      };

      if (!this.isSameReproLitterEntity(existing, incoming)) {
        for (const r of list) {
          errors.push({
            rowNumber: r.rowNumber,
            field: null,
            message: '同一窝已存在但窝级字段冲突',
          });
        }
      }
    }

    const errorRows = this.countErroredRows(errors);
    const summary: ImportSummary = {
      totalRows,
      validRows: Math.max(totalRows - errorRows, 0),
      errorRows,
      warningsCount: warnings.length,
    };

    const erroredRowSet = new Set(errors.map((e) => e.rowNumber));

    const groups: ReproLitterGroup[] = [];
    for (const [key, list] of rowsByLitterKey.entries()) {
      if (conflictedLitterKeys.has(key)) continue;
      if (list.some((r) => erroredRowSet.has(r.rowNumber))) continue;
      const base = list[0]!;
      const expected = this.computeReproLitterExpected(base.litter);
      if (expected.error) continue;

      const piglets: ReproPigletRow[] = [];
      for (const r of list) {
        const p = pigByEar.get(r.earTagNo);
        if (!p) continue;
        piglets.push({
          pigId: p.id,
          birthWeightKg: r.piglet.birthWeightKg,
          leftTeats: r.piglet.leftTeats,
          rightTeats: r.piglet.rightTeats,
          weanWeightIndKg: r.piglet.weanWeightIndKg,
          remark: r.piglet.remark,
        });
      }

      groups.push({
        damEarTagNo: base.damEarTagNo,
        farrowingDate: base.farrowingDate,
        litter: base.litter,
        computed: expected.computed,
        piglets,
      });
    }

    const payload: ReproPayload = { groups };
    const batch = await this.batches.save(
      this.batches.create({
        unitId: resolvedUnitId,
        userId: user.sub,
        module: 'repro',
        year: null,
        status: 'validated' as ImportBatchStatus,
        filename: filename.slice(0, 200),
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        errorRows: summary.errorRows,
        warningsCount: warnings.length,
        payloadJson: payload as unknown as Record<string, unknown>,
      }),
    );

    if (errors.length > 0) {
      await this.rowErrors.save(
        errors.map((e) =>
          this.rowErrors.create({
            batchId: batch.id,
            rowNumber: e.rowNumber,
            field: e.field,
            message: e.message,
          }),
        ),
      );
    }

    return {
      batchId: batch.id,
      summary,
      errors: errors.sort((a, b) =>
        a.rowNumber === b.rowNumber
          ? String(a.field ?? '').localeCompare(String(b.field ?? ''))
          : a.rowNumber - b.rowNumber,
      ),
      warnings,
    };
  }

  private async validateCarcass(
    user: JwtPayload,
    unitId: string | undefined,
    year: string | undefined,
    filename: string,
    buffer: Buffer,
  ) {
    void user;
    const resolvedUnitId = this.resolveUnitIdForImport(unitId);
    const resolvedYear = this.parseYear(year);
    void resolvedYear;

    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('xlsx为空');

    const requiredKeys = ['ear_tag_no'] as const;
    const allKeys = [
      'ear_tag_no',
      'slaughter_date',
      'pre_slaughter_weight_kg',
      'carcass_weight_left_kg',
      'carcass_weight_right_kg',
      'rib_count',
      'carcass_length_cm',
      'body_oblique_length_cm',
      'backfat_shoulder_mm',
      'backfat_last_rib_mm',
      'backfat_lumbar_mm',
      'skin_thickness_6_7_rib_mm',
      'ema_last_rib_cm2',
      'ema_height_cm',
      'ema_width_cm',
      'left_detach_skin_kg',
      'left_detach_bone_kg',
      'left_detach_fat_kg',
      'left_detach_lean_kg',
      'left_leg_weight_kg',
      'hoof_weight_kg',
      'head_weight_kg',
      'remark',
    ] as const;

    const colIndexByKey = this.mapHeaders(sheet.getRow(1), {
      ear_tag_no: ['耳标号ear_tag_no', '耳标号', 'ear_tag_no'],
      slaughter_date: ['屠宰日期slaughter_date', '屠宰日期', 'slaughter_date'],
      pre_slaughter_weight_kg: [
        '宰前活重pre_slaughter_weight_kg',
        '宰前活重',
        'pre_slaughter_weight_kg',
      ],
      carcass_weight_left_kg: [
        '左胴体重carcass_weight_left_kg',
        '左胴体重',
        'carcass_weight_left_kg',
      ],
      carcass_weight_right_kg: [
        '右胴体重carcass_weight_right_kg',
        '右胴体重',
        'carcass_weight_right_kg',
      ],
      rib_count: ['肋骨数rib_count', '肋骨数', 'rib_count'],
      carcass_length_cm: ['胴体长carcass_length_cm', '胴体长', 'carcass_length_cm'],
      body_oblique_length_cm: [
        '体斜长body_oblique_length_cm',
        '体斜长',
        'body_oblique_length_cm',
      ],
      backfat_shoulder_mm: [
        '背膘(肩)backfat_shoulder_mm',
        '背膘(肩)',
        'backfat_shoulder_mm',
        'backfat_shoulder_mm',
      ],
      backfat_last_rib_mm: [
        '背膘(最后肋)backfat_last_rib_mm',
        '背膘(最后肋)',
        'backfat_last_rib_mm',
      ],
      backfat_lumbar_mm: [
        '背膘(腰荐)backfat_lumbar_mm',
        '背膘(腰荐)',
        'backfat_lumbar_mm',
      ],
      skin_thickness_6_7_rib_mm: [
        '皮厚(6~7肋)skin_thickness_6_7_rib_mm',
        '皮厚(6~7肋)',
        'skin_thickness_6_7_rib_mm',
      ],
      ema_last_rib_cm2: [
        '眼肌面积ema_last_rib_cm2',
        '眼肌面积',
        'ema_last_rib_cm2',
      ],
      ema_height_cm: ['眼肌高ema_height_cm', '眼肌高', 'ema_height_cm'],
      ema_width_cm: ['眼肌宽ema_width_cm', '眼肌宽', 'ema_width_cm'],
      left_detach_skin_kg: [
        '皮重(kg)left_detach_skin_kg',
        '皮重',
        'left_detach_skin_kg',
      ],
      left_detach_bone_kg: [
        '骨重(kg)left_detach_bone_kg',
        '骨重',
        'left_detach_bone_kg',
      ],
      left_detach_fat_kg: [
        '肥肉重(kg)left_detach_fat_kg',
        '肥肉重',
        'left_detach_fat_kg',
      ],
      left_detach_lean_kg: [
        '瘦肉重(kg)left_detach_lean_kg',
        '瘦肉重',
        'left_detach_lean_kg',
      ],
      left_leg_weight_kg: [
        '左腿臀重(kg)left_leg_weight_kg',
        '左腿臀重',
        'left_leg_weight_kg',
      ],
      hoof_weight_kg: ['蹄重(kg)hoof_weight_kg', '蹄重', 'hoof_weight_kg'],
      head_weight_kg: ['头重(kg)head_weight_kg', '头重', 'head_weight_kg'],
      remark: ['备注remark', '备注', 'remark'],
    });

    for (const k of requiredKeys) {
      if (!colIndexByKey[k]) throw new BadRequestException(`缺少表头列: ${k}`);
    }

    const errors: RowError[] = [];
    const warnings: string[] = [];

    const earTagRowNo = new Map<string, number>();
    const earTagRowNos = new Map<string, number[]>();
    const parsedByEar = new Map<string, { rowNumber: number; payload: CarcassPayloadRow }>();

    let totalRows = 0;

    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
      const row = sheet.getRow(rowNo);
      const values = allKeys.map((k) => this.getCellValue(row, colIndexByKey[k]));
      const hasAny = values.some((v) => !this.isEmptyCell(v));
      if (!hasAny) continue;
      totalRows++;

      const rowErrors: RowError[] = [];

      const rawEarTagNo = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.ear_tag_no),
      );
      const earTagNo = rawEarTagNo?.trim() ?? '';
      if (!earTagNo) {
        rowErrors.push({ rowNumber: rowNo, field: 'ear_tag_no', message: '耳标号必填' });
      } else {
        const normalizedEar = earTagNo.trim();
        if (earTagRowNo.has(normalizedEar)) {
          rowErrors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号在文件内重复',
          });
        } else {
          earTagRowNo.set(normalizedEar, rowNo);
        }
        const list = earTagRowNos.get(normalizedEar) ?? [];
        list.push(rowNo);
        earTagRowNos.set(normalizedEar, list);
      }

      const slaughterDate = this.parseDateOrNull(
        this.getCellValue(row, colIndexByKey.slaughter_date),
      );
      if (slaughterDate === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'slaughter_date',
          message: '屠宰日期格式应为YYYY-MM-DD',
        });
      }

      const preSlaughterWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.pre_slaughter_weight_kg),
      );
      if (preSlaughterWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'pre_slaughter_weight_kg',
          message: '宰前活重格式不正确',
        });
      }

      const carcassWeightLeftKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.carcass_weight_left_kg),
      );
      if (carcassWeightLeftKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'carcass_weight_left_kg',
          message: '左胴体重格式不正确',
        });
      }

      const carcassWeightRightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.carcass_weight_right_kg),
      );
      if (carcassWeightRightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'carcass_weight_right_kg',
          message: '右胴体重格式不正确',
        });
      }

      const ribCount = this.parseIntCell(
        this.getCellValue(row, colIndexByKey.rib_count),
      );
      if (ribCount === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'rib_count',
          message: '肋骨数格式不正确',
        });
      }

      const carcassLengthCm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.carcass_length_cm),
      );
      if (carcassLengthCm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'carcass_length_cm',
          message: '胴体长格式不正确',
        });
      }

      const bodyObliqueLengthCm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.body_oblique_length_cm),
      );
      if (bodyObliqueLengthCm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'body_oblique_length_cm',
          message: '体斜长格式不正确',
        });
      }

      const backfatShoulderMm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.backfat_shoulder_mm),
      );
      if (backfatShoulderMm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'backfat_shoulder_mm',
          message: '背膘(肩)格式不正确',
        });
      }

      const backfatLastRibMm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.backfat_last_rib_mm),
      );
      if (backfatLastRibMm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'backfat_last_rib_mm',
          message: '背膘(最后肋)格式不正确',
        });
      }

      const backfatLumbarMm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.backfat_lumbar_mm),
      );
      if (backfatLumbarMm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'backfat_lumbar_mm',
          message: '背膘(腰荐)格式不正确',
        });
      }

      const skinThickness6_7RibMm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.skin_thickness_6_7_rib_mm),
      );
      if (skinThickness6_7RibMm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'skin_thickness_6_7_rib_mm',
          message: '皮厚(6~7肋)格式不正确',
        });
      }

      const emaLastRibCm2 = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.ema_last_rib_cm2),
      );
      if (emaLastRibCm2 === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'ema_last_rib_cm2',
          message: '眼肌面积格式不正确',
        });
      }

      const emaHeightCm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.ema_height_cm),
      );
      if (emaHeightCm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'ema_height_cm',
          message: '眼肌高格式不正确',
        });
      }

      const emaWidthCm = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.ema_width_cm),
      );
      if (emaWidthCm === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'ema_width_cm',
          message: '眼肌宽格式不正确',
        });
      }

      const leftDetachSkinKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.left_detach_skin_kg),
      );
      if (leftDetachSkinKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'left_detach_skin_kg',
          message: '皮重格式不正确',
        });
      }

      const leftDetachBoneKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.left_detach_bone_kg),
      );
      if (leftDetachBoneKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'left_detach_bone_kg',
          message: '骨重格式不正确',
        });
      }

      const leftDetachFatKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.left_detach_fat_kg),
      );
      if (leftDetachFatKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'left_detach_fat_kg',
          message: '肥肉重格式不正确',
        });
      }

      const leftDetachLeanKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.left_detach_lean_kg),
      );
      if (leftDetachLeanKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'left_detach_lean_kg',
          message: '瘦肉重格式不正确',
        });
      }

      const leftLegWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.left_leg_weight_kg),
      );
      if (leftLegWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'left_leg_weight_kg',
          message: '左腿臀重格式不正确',
        });
      }

      const hoofWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.hoof_weight_kg),
      );
      if (hoofWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'hoof_weight_kg',
          message: '蹄重格式不正确',
        });
      }

      const headWeightKg = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.head_weight_kg),
      );
      if (headWeightKg === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'head_weight_kg',
          message: '头重格式不正确',
        });
      }

      const remark = this.normalizeOptionalString(
        this.parseStringCell(this.getCellValue(row, colIndexByKey.remark)),
      );

      if (rowErrors.length === 0) {
        const record = this.carcass.create({ pigId: 0 });
        Object.assign(
          record,
          normalizeCarcassInput({
            slaughterDate: slaughterDate ?? null,
            preSlaughterWeightKg: (preSlaughterWeightKg ?? null) as number | null,
            carcassWeightLeftKg: (carcassWeightLeftKg ?? null) as number | null,
            carcassWeightRightKg: (carcassWeightRightKg ?? null) as number | null,
            ribCount: ribCount ?? null,
            carcassLengthCm: (carcassLengthCm ?? null) as number | null,
            bodyObliqueLengthCm: (bodyObliqueLengthCm ?? null) as number | null,
            backfatShoulderMm: (backfatShoulderMm ?? null) as number | null,
            backfatLastRibMm: (backfatLastRibMm ?? null) as number | null,
            backfatLumbarMm: (backfatLumbarMm ?? null) as number | null,
            skinThickness6_7RibMm: (skinThickness6_7RibMm ?? null) as number | null,
            emaLastRibCm2: (emaLastRibCm2 ?? null) as number | null,
            emaHeightCm: (emaHeightCm ?? null) as number | null,
            emaWidthCm: (emaWidthCm ?? null) as number | null,
            leftDetachSkinKg: (leftDetachSkinKg ?? null) as number | null,
            leftDetachBoneKg: (leftDetachBoneKg ?? null) as number | null,
            leftDetachFatKg: (leftDetachFatKg ?? null) as number | null,
            leftDetachLeanKg: (leftDetachLeanKg ?? null) as number | null,
            hoofWeightKg: (hoofWeightKg ?? null) as number | null,
            headWeightKg: (headWeightKg ?? null) as number | null,
            leftLegWeightKg: (leftLegWeightKg ?? null) as number | null,
            remark,
          }),
        );

        try {
          validateCarcassBasic(record);
          const w = computeCarcassDerived(record).warnings;
          validateCarcassLogical(record);
          warnings.push(...w.map((msg) => `行 ${rowNo}：${msg}`));
        } catch (e: any) {
          rowErrors.push({
            rowNumber: rowNo,
            field: null,
            message: typeof e?.message === 'string' ? e.message : '校验失败',
          });
        }

        if (rowErrors.length === 0 && earTagNo) {
          parsedByEar.set(earTagNo, {
            rowNumber: rowNo,
            payload: {
              pigId: 0,
              slaughterDate: record.slaughterDate ?? null,
              preSlaughterWeightKg: record.preSlaughterWeightKg ?? null,
              carcassWeightLeftKg: record.carcassWeightLeftKg ?? null,
              carcassWeightRightKg: record.carcassWeightRightKg ?? null,
              carcassLengthCm: record.carcassLengthCm ?? null,
              bodyObliqueLengthCm: record.bodyObliqueLengthCm ?? null,
              backfatShoulderMm: record.backfatShoulderMm ?? null,
              backfatLastRibMm: record.backfatLastRibMm ?? null,
              backfatLumbarMm: record.backfatLumbarMm ?? null,
              skinThickness6_7RibMm: record.skinThickness6_7RibMm ?? null,
              emaLastRibCm2: record.emaLastRibCm2 ?? null,
              emaHeightCm: record.emaHeightCm ?? null,
              emaWidthCm: record.emaWidthCm ?? null,
              leftDetachSkinKg: record.leftDetachSkinKg ?? null,
              leftDetachBoneKg: record.leftDetachBoneKg ?? null,
              leftDetachFatKg: record.leftDetachFatKg ?? null,
              leftDetachLeanKg: record.leftDetachLeanKg ?? null,
              ribCount: record.ribCount ?? null,
              hoofWeightKg: record.hoofWeightKg ?? null,
              headWeightKg: record.headWeightKg ?? null,
              leftLegWeightKg: record.leftLegWeightKg ?? null,
              detachLossPct: record.detachLossPct ?? null,
              legHipRatioPct: record.legHipRatioPct ?? null,
              skinRatePct: record.skinRatePct ?? null,
              boneRatePct: record.boneRatePct ?? null,
              fatRatePct: record.fatRatePct ?? null,
              leanRatePct: record.leanRatePct ?? null,
              slaughterRatePct: record.slaughterRatePct ?? null,
              remark: record.remark ?? null,
            },
          });
        }
      }

      errors.push(...rowErrors);
    }

    const earTags = [...earTagRowNos.keys()];
    const pigByEar = new Map<string, PigEntity>();
    if (earTags.length > 0) {
      const pigs = await this.pigs
        .createQueryBuilder('p')
        .where('p.unitId = :unitId', { unitId: resolvedUnitId })
        .andWhere('p.earTagNo IN (:...earTags)', { earTags })
        .getMany();
      for (const p of pigs) pigByEar.set(p.earTagNo, p);

      for (const earTagNo of earTags) {
        if (pigByEar.has(earTagNo)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号不存在或不属于该单位',
          });
        }
      }
    }

    const pigIds: number[] = [];
    for (const earTagNo of earTags) {
      const p = pigByEar.get(earTagNo);
      if (p) pigIds.push(p.id);
    }

    if (pigIds.length > 0) {
      const existing = await this.carcass
        .createQueryBuilder('c')
        .select(['c.pigId'])
        .where('c.pigId IN (:...pigIds)', { pigIds })
        .getMany();
      const existingSet = new Set(existing.map((e) => e.pigId));
      for (const earTagNo of earTags) {
        const p = pigByEar.get(earTagNo);
        if (!p) continue;
        if (!existingSet.has(p.id)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: 'carcass记录已存在',
          });
        }
      }
    }

    const errorRows = this.countErroredRows(errors);
    const summary: ImportSummary = {
      totalRows,
      validRows: Math.max(totalRows - errorRows, 0),
      errorRows,
      warningsCount: warnings.length,
    };

    const erroredRowSet = new Set(errors.map((e) => e.rowNumber));
    const payloadRows: CarcassPayloadRow[] = [];
    for (const [earTagNo, v] of parsedByEar.entries()) {
      if (erroredRowSet.has(v.rowNumber)) continue;
      const pig = pigByEar.get(earTagNo);
      if (!pig) continue;
      payloadRows.push({ ...v.payload, pigId: pig.id });
    }

    const payload: CarcassPayload = { rows: payloadRows };
    const batch = await this.batches.save(
      this.batches.create({
        unitId: resolvedUnitId,
        userId: user.sub,
        module: 'carcass',
        year: null,
        status: 'validated' as ImportBatchStatus,
        filename: filename.slice(0, 200),
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        errorRows: summary.errorRows,
        warningsCount: warnings.length,
        payloadJson: payload as unknown as Record<string, unknown>,
      }),
    );

    if (errors.length > 0) {
      await this.rowErrors.save(
        errors.map((e) =>
          this.rowErrors.create({
            batchId: batch.id,
            rowNumber: e.rowNumber,
            field: e.field,
            message: e.message,
          }),
        ),
      );
    }

    return {
      batchId: batch.id,
      summary,
      errors: errors.sort((a, b) =>
        a.rowNumber === b.rowNumber
          ? String(a.field ?? '').localeCompare(String(b.field ?? ''))
          : a.rowNumber - b.rowNumber,
      ),
      warnings,
    };
  }

  private async validateMeatq(
    user: JwtPayload,
    unitId: string | undefined,
    year: string | undefined,
    filename: string,
    buffer: Buffer,
  ) {
    void user;
    const resolvedUnitId = this.resolveUnitIdForImport(unitId);
    const resolvedYear = this.parseYear(year);
    void resolvedYear;

    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('xlsx为空');

    const requiredKeys = ['ear_tag_no'] as const;
    const allKeys = [
      'ear_tag_no',
      'color_score',
      'color_l',
      'color_a',
      'color_b',
      'ph_1h',
      'ph_24h',
      'drip_loss_pct',
      'water_holding_pct',
      'marbling_score',
      'imf_pct',
      'imp_pct',
      'moisture_pct',
      'tenderness_shear_n',
      'cooked_meat_rate',
      'remark',
      'warnings',
    ] as const;

    const colIndexByKey = this.mapHeaders(sheet.getRow(1), {
      ear_tag_no: ['耳标号ear_tag_no', '耳标号', 'ear_tag_no'],
      color_score: ['肉色评分color_score', '肉色评分', 'color_score', 'colorScore'],
      color_l: ['l*color_l', 'l*', 'color_l', 'colorL'],
      color_a: ['a*color_a', 'a*', 'color_a', 'colorA'],
      color_b: ['b*color_b', 'b*', 'color_b', 'colorB'],
      ph_1h: ['ph(1h)ph_1h', 'ph(1h)', 'ph_1h', 'ph1h'],
      ph_24h: ['ph(24h)ph_24h', 'ph(24h)', 'ph_24h', 'ph24h'],
      drip_loss_pct: [
        '滴水损失(%)drip_loss_pct',
        '滴水损失(%)',
        'drip_loss_pct',
        'dripLossPct',
      ],
      water_holding_pct: [
        '系水力(%)water_holding_pct',
        '系水力(%)',
        'water_holding_pct',
        'waterHoldingPct',
      ],
      marbling_score: [
        '大理石纹评分marbling_score',
        '大理石纹评分',
        'marbling_score',
        'marblingScore',
      ],
      imf_pct: ['肌内脂肪(%)imf_pct', '肌内脂肪(%)', 'imf_pct', 'imfPct'],
      imp_pct: ['肌间脂肪(%)imp_pct', '肌间脂肪(%)', 'imp_pct', 'impPct'],
      moisture_pct: ['水分(%)moisture_pct', '水分(%)', 'moisture_pct', 'moisturePct'],
      tenderness_shear_n: [
        '嫩度剪切力(n)tenderness_shear_n',
        '嫩度剪切力(n)',
        'tenderness_shear_n',
        'tendernessShearN',
      ],
      cooked_meat_rate: [
        '熟肉率(%)cooked_meat_rate',
        '熟肉率(%)',
        'cooked_meat_rate',
        'cookedMeatRate',
      ],
      remark: ['备注remark', '备注', 'remark'],
      warnings: ['warnings', 'warning'],
    });

    for (const k of requiredKeys) {
      if (!colIndexByKey[k]) throw new BadRequestException(`缺少表头列: ${k}`);
    }

    const errors: RowError[] = [];
    const warnings: string[] = [];
    const payloadByEar = new Map<
      string,
      { rowNumber: number; payload: MeatqPayloadRow }
    >();

    const earTagRowNo = new Map<string, number>();
    const earTagRowNos = new Map<string, number[]>();
    let totalRows = 0;

    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
      const row = sheet.getRow(rowNo);
      const values = allKeys.map((k) => this.getCellValue(row, colIndexByKey[k]));
      const hasAny = values.some((v) => !this.isEmptyCell(v));
      if (!hasAny) continue;
      totalRows++;

      const rowErrors: RowError[] = [];

      const rawEarTagNo = this.parseStringCell(
        this.getCellValue(row, colIndexByKey.ear_tag_no),
      );
      const earTagNo = rawEarTagNo?.trim() ?? '';
      if (!earTagNo) {
        rowErrors.push({ rowNumber: rowNo, field: 'ear_tag_no', message: '耳标号必填' });
      } else {
        const normalizedEar = earTagNo.trim();
        if (earTagRowNo.has(normalizedEar)) {
          rowErrors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号在文件内重复',
          });
        } else {
          earTagRowNo.set(normalizedEar, rowNo);
        }
        const list = earTagRowNos.get(normalizedEar) ?? [];
        list.push(rowNo);
        earTagRowNos.set(normalizedEar, list);
      }

      const colorScore = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.color_score),
      );
      if (colorScore === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'color_score', message: '肉色评分格式不正确' });
      }
      const colorL = this.parseNumberCell(this.getCellValue(row, colIndexByKey.color_l));
      if (colorL === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'color_l', message: 'L*格式不正确' });
      }
      const colorA = this.parseNumberCell(this.getCellValue(row, colIndexByKey.color_a));
      if (colorA === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'color_a', message: 'a*格式不正确' });
      }
      const colorB = this.parseNumberCell(this.getCellValue(row, colIndexByKey.color_b));
      if (colorB === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'color_b', message: 'b*格式不正确' });
      }
      const ph1h = this.parseNumberCell(this.getCellValue(row, colIndexByKey.ph_1h));
      if (ph1h === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'ph_1h', message: 'pH(1h)格式不正确' });
      }
      const ph24h = this.parseNumberCell(this.getCellValue(row, colIndexByKey.ph_24h));
      if (ph24h === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'ph_24h', message: 'pH(24h)格式不正确' });
      }
      const dripLossPct = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.drip_loss_pct),
      );
      if (dripLossPct === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'drip_loss_pct',
          message: '滴水损失格式不正确',
        });
      }
      const waterHoldingPct = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.water_holding_pct),
      );
      if (waterHoldingPct === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'water_holding_pct',
          message: '系水力格式不正确',
        });
      }
      const marblingScore = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.marbling_score),
      );
      if (marblingScore === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'marbling_score',
          message: '大理石纹评分格式不正确',
        });
      }
      const imfPct = this.parseNumberCell(this.getCellValue(row, colIndexByKey.imf_pct));
      if (imfPct === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'imf_pct', message: '肌内脂肪格式不正确' });
      }
      const impPct = this.parseNumberCell(this.getCellValue(row, colIndexByKey.imp_pct));
      if (impPct === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'imp_pct', message: '肌间脂肪格式不正确' });
      }
      const moisturePct = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.moisture_pct),
      );
      if (moisturePct === undefined) {
        rowErrors.push({ rowNumber: rowNo, field: 'moisture_pct', message: '水分格式不正确' });
      }
      const tendernessShearN = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.tenderness_shear_n),
      );
      if (tendernessShearN === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'tenderness_shear_n',
          message: '嫩度剪切力格式不正确',
        });
      }
      const cookedMeatRate = this.parseNumberCell(
        this.getCellValue(row, colIndexByKey.cooked_meat_rate),
      );
      if (cookedMeatRate === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'cooked_meat_rate',
          message: '熟肉率格式不正确',
        });
      }

      const remark = this.normalizeOptionalString(
        this.parseStringCell(this.getCellValue(row, colIndexByKey.remark)),
      );

      if (rowErrors.length === 0) {
        const record = this.meatq.create({ pigId: 0 });
        Object.assign(
          record,
          normalizeMeatqInput({
            sex: null,
            colorScore: (colorScore ?? null) as number | null,
            colorL: (colorL ?? null) as number | null,
            colorA: (colorA ?? null) as number | null,
            colorB: (colorB ?? null) as number | null,
            ph1h: (ph1h ?? null) as number | null,
            ph24h: (ph24h ?? null) as number | null,
            dripLossPct: (dripLossPct ?? null) as number | null,
            waterHoldingPct: (waterHoldingPct ?? null) as number | null,
            marblingScore: (marblingScore ?? null) as number | null,
            imfPct: (imfPct ?? null) as number | null,
            impPct: (impPct ?? null) as number | null,
            moisturePct: (moisturePct ?? null) as number | null,
            tendernessShearN: (tendernessShearN ?? null) as number | null,
            cookedMeatRate: (cookedMeatRate ?? null) as number | null,
            remark,
          }),
        );
        try {
          validateMeatqStrong(record);
          const ws = computeMeatqWarnings(record);
          warnings.push(...ws.map((w) => `行 ${rowNo}：${w}`));
        } catch (e: any) {
          rowErrors.push({
            rowNumber: rowNo,
            field: null,
            message: typeof e?.message === 'string' ? e.message : '校验失败',
          });
        }

        if (rowErrors.length === 0 && earTagNo) {
          payloadByEar.set(earTagNo, {
            rowNumber: rowNo,
            payload: {
            pigId: 0,
            sex: null,
            colorScore: record.colorScore ?? null,
            colorL: record.colorL ?? null,
            colorA: record.colorA ?? null,
            colorB: record.colorB ?? null,
            ph1h: record.ph1h ?? null,
            ph24h: record.ph24h ?? null,
            dripLossPct: record.dripLossPct ?? null,
            waterHoldingPct: record.waterHoldingPct ?? null,
            marblingScore: record.marblingScore ?? null,
            imfPct: record.imfPct ?? null,
            impPct: record.impPct ?? null,
            moisturePct: record.moisturePct ?? null,
            tendernessShearN: record.tendernessShearN ?? null,
            cookedMeatRate: record.cookedMeatRate ?? null,
            remark: record.remark ?? null,
            },
          });
        }
      }

      errors.push(...rowErrors);
    }

    const earTags = [...earTagRowNos.keys()];
    const pigByEar = new Map<string, PigEntity>();
    if (earTags.length > 0) {
      const pigs = await this.pigs
        .createQueryBuilder('p')
        .where('p.unitId = :unitId', { unitId: resolvedUnitId })
        .andWhere('p.earTagNo IN (:...earTags)', { earTags })
        .getMany();
      for (const p of pigs) pigByEar.set(p.earTagNo, p);

      for (const earTagNo of earTags) {
        if (pigByEar.has(earTagNo)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: '耳标号不存在或不属于该单位',
          });
        }
      }
    }

    const pigIds: number[] = [];
    for (const earTagNo of earTags) {
      const p = pigByEar.get(earTagNo);
      if (p) pigIds.push(p.id);
    }

    if (pigIds.length > 0) {
      const existing = await this.meatq
        .createQueryBuilder('m')
        .select(['m.pigId'])
        .where('m.pigId IN (:...pigIds)', { pigIds })
        .getMany();
      const existingSet = new Set(existing.map((e) => e.pigId));
      for (const earTagNo of earTags) {
        const p = pigByEar.get(earTagNo);
        if (!p) continue;
        if (!existingSet.has(p.id)) continue;
        const rowNos = earTagRowNos.get(earTagNo) ?? [];
        for (const rowNo of rowNos) {
          errors.push({
            rowNumber: rowNo,
            field: 'ear_tag_no',
            message: 'meatq记录已存在',
          });
        }
      }
    }

    const errorRows = this.countErroredRows(errors);
    const summary: ImportSummary = {
      totalRows,
      validRows: Math.max(totalRows - errorRows, 0),
      errorRows,
      warningsCount: warnings.length,
    };

    const erroredRowSet = new Set(errors.map((e) => e.rowNumber));
    const finalRows: MeatqPayloadRow[] = [];
    for (const [earTagNo, v] of payloadByEar.entries()) {
      if (erroredRowSet.has(v.rowNumber)) continue;
      const pig = pigByEar.get(earTagNo);
      if (!pig) continue;
      finalRows.push({ ...v.payload, pigId: pig.id });
    }

    const payload: MeatqPayload = { rows: finalRows };
    const batch = await this.batches.save(
      this.batches.create({
        unitId: resolvedUnitId,
        userId: user.sub,
        module: 'meatq',
        year: null,
        status: 'validated' as ImportBatchStatus,
        filename: filename.slice(0, 200),
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        errorRows: summary.errorRows,
        warningsCount: warnings.length,
        payloadJson: payload as unknown as Record<string, unknown>,
      }),
    );

    if (errors.length > 0) {
      await this.rowErrors.save(
        errors.map((e) =>
          this.rowErrors.create({
            batchId: batch.id,
            rowNumber: e.rowNumber,
            field: e.field,
            message: e.message,
          }),
        ),
      );
    }

    return {
      batchId: batch.id,
      summary,
      errors: errors.sort((a, b) =>
        a.rowNumber === b.rowNumber
          ? String(a.field ?? '').localeCompare(String(b.field ?? ''))
          : a.rowNumber - b.rowNumber,
      ),
      warnings,
    };
  }

  private async validateBaseInfo(
    user: JwtPayload,
    unitId: string | undefined,
    year: string | undefined,
    filename: string,
    buffer: Buffer,
  ) {
    void user;
    const resolvedUnitId = this.resolveUnitIdForImport(unitId);
    const resolvedYear = this.parseYear(year);
    if (resolvedYear == null) throw new BadRequestException('year必填');

    const unit = await this.units.findOne({ where: { id: resolvedUnitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('xlsx为空');

    const colIndexByKey = this.mapHeaders(sheet.getRow(1), {
      name: ['名称name', '名称', 'name'],
      level: ['级别level', '级别', 'level'],
      code: ['编号code', '编号', 'code'],
      address: ['地址address', '地址', 'address'],
      principal: ['负责人principal', '负责人', 'principal'],
      phone: ['电话phone', '电话', 'phone'],
      email: ['邮箱email', '邮箱', 'email'],
      farmCode: ['畜禽养殖场代码farmCode', '畜禽养殖场代码', 'farmCode'],
      technicianCount: [
        '专业技术人员数量technicianCount',
        '专业技术人员数量',
        'technicianCount',
      ],
      technicalPrincipal: [
        '技术负责人technicalPrincipal',
        '技术负责人',
        'technicalPrincipal',
      ],
      technicalTitleOrDegree: [
        '学历或职称technicalTitleOrDegree',
        '学历或职称',
        'technicalTitleOrDegree',
      ],
      protectedBreedName: [
        '保护品种名称protectedBreedName',
        '保护品种名称',
        'protectedBreedName',
      ],
      inStockCount: ['存栏数量inStockCount', '存栏数量', 'inStockCount'],
      familyCount: ['家系数量familyCount', '家系数量', 'familyCount'],
      breedingCount: ['种畜数量breedingCount', '种畜数量', 'breedingCount'],
      breedingMaleCount: [
        '种公畜数量breedingMaleCount',
        '种公畜数量',
        'breedingMaleCount',
      ],
      breedingFemaleBaseCount: [
        '基础母畜数量breedingFemaleBaseCount',
        '基础母畜数量',
        'breedingFemaleBaseCount',
      ],
      reserveCount: ['后备畜群数量reserveCount', '后备畜群数量', 'reserveCount'],
      reserveMaleCount: [
        '后备公畜数量reserveMaleCount',
        '后备公畜数量',
        'reserveMaleCount',
      ],
      reserveFemaleCount: [
        '后备母畜数量reserveFemaleCount',
        '后备母畜数量',
        'reserveFemaleCount',
      ],
      landAreaM2: ['占地面积(㎡)landAreaM2', '占地面积(㎡)', 'landAreaM2'],
      housingAreaM2: ['畜舍面积(㎡)housingAreaM2', '畜舍面积(㎡)', 'housingAreaM2'],
      fixedAssets10kCny: [
        '固定资产(万元)fixedAssets10kCny',
        '固定资产(万元)',
        'fixedAssets10kCny',
      ],
      filler: ['填表人filler', '填表人', 'filler'],
      contact: ['联系方式contact', '联系方式', 'contact'],
      fillDate: ['日期fillDate', '日期', 'fillDate', 'fill_date'],
    } as const);

    if (!colIndexByKey.name) throw new BadRequestException('缺少表头列: name');

    const errors: RowError[] = [];
    const warnings: string[] = [];

    const nonEmptyRows: ExcelJS.Row[] = [];
    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
      const row = sheet.getRow(rowNo);
      const hasAny =
        row.values != null &&
        (row.values as any[]).some((v) => !this.isEmptyCell(v));
      if (!hasAny) continue;
      nonEmptyRows.push(row);
    }

    if (nonEmptyRows.length !== 1) {
      const rowNo = nonEmptyRows[0]?.number ?? 2;
      errors.push({
        rowNumber: rowNo,
        field: null,
        message: 'base_info 仅支持单行导入',
      });
    }

    const existing = await this.baseInfo.findOne({
      where: { unitId: resolvedUnitId, year: resolvedYear },
    });
    if (existing) {
      errors.push({
        rowNumber: 2,
        field: null,
        message: 'base_info 记录已存在',
      });
    }

    let payloadRow: BaseInfoPayload | null = null;

    if (errors.length === 0) {
      const row = nonEmptyRows[0]!;
      const rowNo = row.number;
      const rowErrors: RowError[] = [];

      const getStr = (key: keyof typeof colIndexByKey) =>
        this.normalizeOptionalString(
          this.parseStringCell(this.getCellValue(row, colIndexByKey[key])),
        );

      const getNum = (key: keyof typeof colIndexByKey, field: string) => {
        const v = this.parseNumberCell(this.getCellValue(row, colIndexByKey[key]));
        if (v === undefined) {
          rowErrors.push({ rowNumber: rowNo, field, message: '格式不正确' });
          return null;
        }
        if (v == null) return null;
        if (v < 0) {
          rowErrors.push({ rowNumber: rowNo, field, message: '必须为非负数' });
          return null;
        }
        return v;
      };

      const name = getStr('name');
      const level = getStr('level');
      const allowedLevel = new Set(['国家级', '省级', '其他']);
      if (level != null && !allowedLevel.has(level)) {
        rowErrors.push({ rowNumber: rowNo, field: 'level', message: '级别不正确' });
      }

      const fillDate = this.parseDateOrNull(
        this.getCellValue(row, colIndexByKey.fillDate),
      );
      if (fillDate === undefined) {
        rowErrors.push({
          rowNumber: rowNo,
          field: 'fillDate',
          message: '日期格式应为YYYY-MM-DD',
        });
      }

      const data: Record<string, unknown> = {
        name,
        level,
        code: getStr('code'),
        address: getStr('address'),
        principal: getStr('principal'),
        phone: getStr('phone'),
        email: getStr('email'),
        farmCode: getStr('farmCode'),
        technicianCount: getNum('technicianCount', 'technicianCount'),
        technicalPrincipal: getStr('technicalPrincipal'),
        technicalTitleOrDegree: getStr('technicalTitleOrDegree'),
        protectedBreedName: getStr('protectedBreedName'),
        inStockCount: getNum('inStockCount', 'inStockCount'),
        familyCount: getNum('familyCount', 'familyCount'),
        breedingCount: getNum('breedingCount', 'breedingCount'),
        breedingMaleCount: getNum('breedingMaleCount', 'breedingMaleCount'),
        breedingFemaleBaseCount: getNum(
          'breedingFemaleBaseCount',
          'breedingFemaleBaseCount',
        ),
        reserveCount: getNum('reserveCount', 'reserveCount'),
        reserveMaleCount: getNum('reserveMaleCount', 'reserveMaleCount'),
        reserveFemaleCount: getNum('reserveFemaleCount', 'reserveFemaleCount'),
        landAreaM2: getNum('landAreaM2', 'landAreaM2'),
        housingAreaM2: getNum('housingAreaM2', 'housingAreaM2'),
        fixedAssets10kCny: getNum('fixedAssets10kCny', 'fixedAssets10kCny'),
        filler: getStr('filler'),
        contact: getStr('contact'),
        fillDate: fillDate ?? null,
      };

      const email = data.email as string | null;
      if (email != null && !/.+@.+\..+/.test(email)) {
        warnings.push('email 格式可能不正确');
      }
      const phone = data.phone as string | null;
      if (phone != null && !/^[0-9\-+() ]{7,20}$/.test(phone)) {
        warnings.push('phone 格式可能不正确');
      }
      if (!name) warnings.push('缺少 name');
      if (!data.address) warnings.push('缺少 address');
      if (!data.protectedBreedName) warnings.push('缺少 protectedBreedName');

      errors.push(...rowErrors);

      if (rowErrors.length === 0) {
        payloadRow = {
          unitId: resolvedUnitId,
          year: resolvedYear,
          data,
          fillDate: (fillDate ?? null) as string | null,
        };
      }
    }

    const errorRows = this.countErroredRows(errors);
    const summary: ImportSummary = {
      totalRows: nonEmptyRows.length,
      validRows: Math.max(nonEmptyRows.length - errorRows, 0),
      errorRows,
      warningsCount: warnings.length,
    };

    const payload = { row: payloadRow };
    const batch = await this.batches.save(
      this.batches.create({
        unitId: resolvedUnitId,
        userId: user.sub,
        module: 'base_info',
        year: resolvedYear,
        status: 'validated' as ImportBatchStatus,
        filename: filename.slice(0, 200),
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        errorRows: summary.errorRows,
        warningsCount: warnings.length,
        payloadJson: payload as unknown as Record<string, unknown>,
      }),
    );

    if (errors.length > 0) {
      await this.rowErrors.save(
        errors.map((e) =>
          this.rowErrors.create({
            batchId: batch.id,
            rowNumber: e.rowNumber,
            field: e.field,
            message: e.message,
          }),
        ),
      );
    }

    return {
      batchId: batch.id,
      summary,
      errors: errors.sort((a, b) =>
        a.rowNumber === b.rowNumber
          ? String(a.field ?? '').localeCompare(String(b.field ?? ''))
          : a.rowNumber - b.rowNumber,
      ),
      warnings,
    };
  }

  private async commitPigs(module: 'pigs', batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.module !== module)
      throw new NotFoundException('batch不存在');
    if (batch.status !== 'validated')
      throw new BadRequestException('batch状态不允许提交');

    const errorCount = await this.rowErrors.count({
      where: { batchId: batch.id },
    });
    if (errorCount > 0) throw new BadRequestException('存在错误，无法提交');
    const payload = (batch.payloadJson ??
      null) as unknown as PigsPayload | null;
    if (!payload || !Array.isArray(payload.rows)) {
      throw new BadRequestException('batch缺少payload');
    }

    try {
      const inserted = await this.batches.manager.transaction(
        async (manager) => {
          const pigRepo = manager.getRepository(PigEntity);
          let count = 0;
          for (let i = 0; i < payload.rows.length; i += 200) {
            const chunk = payload.rows.slice(i, i + 200).map((r) => ({
              unitId: batch.unitId,
              breedId: r.breedId,
              individualNo: r.individualNo,
              earTagNo: r.earTagNo.trim(),
              sex: r.sex,
              birthDate: r.birthDate,
              birthWeightKg: null,
              damEarTagNo: r.damEarTagNo,
              remark: r.remark,
            }));
            if (chunk.length > 0) {
              await pigRepo.insert(chunk);
              count += chunk.length;
            }
          }

          await manager
            .getRepository(ImportBatchEntity)
            .update({ id: batch.id }, { status: 'committed' });
          return count;
        },
      );

      return { ok: true, inserted };
    } catch (e: any) {
      await this.batches.update({ id: batch.id }, { status: 'failed' });
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('提交失败：唯一键冲突');
      }
      throw new BadRequestException('提交失败');
    }
  }

  private async commitGrowth(module: 'growth', batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.module !== module)
      throw new NotFoundException('batch不存在');
    if (batch.status !== 'validated')
      throw new BadRequestException('batch状态不允许提交');

    const errorCount = await this.rowErrors.count({
      where: { batchId: batch.id },
    });
    if (errorCount > 0) throw new BadRequestException('存在错误，无法提交');

    const payload = (batch.payloadJson ??
      null) as unknown as GrowthPayload | null;
    if (!payload || !Array.isArray(payload.rows)) {
      throw new BadRequestException('batch缺少payload');
    }

    try {
      const inserted = await this.batches.manager.transaction(
        async (manager) => {
          const growthRepo = manager.getRepository(GrowthTestEntity);
          let count = 0;
          for (let i = 0; i < payload.rows.length; i += 200) {
            const chunk = payload.rows.slice(i, i + 200).map((r) => ({
              pigId: r.pigId,
              startDate: r.startDate,
              startAgeDays: r.startAgeDays,
              startWeightKg: r.startWeightKg,
              endDate: r.endDate,
              endAgeDays: r.endAgeDays,
              endWeightKg: r.endWeightKg,
              testDays: r.testDays,
              feedKg: r.feedKg,
              adgG: r.adgG,
              adfiKg: r.adfiKg,
              fcr: r.fcr,
              dtswDays: r.dtswDays,
              endBackfatMm: r.endBackfatMm,
              endEmaCm2: r.endEmaCm2,
              remark: r.remark,
            }));
            if (chunk.length > 0) {
              await growthRepo.insert(chunk);
              count += chunk.length;
            }
          }

          await manager
            .getRepository(ImportBatchEntity)
            .update({ id: batch.id }, { status: 'committed' });
          return count;
        },
      );
      return { ok: true, inserted };
    } catch (e: any) {
      await this.batches.update({ id: batch.id }, { status: 'failed' });
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('提交失败：唯一键冲突');
      }
      throw new BadRequestException('提交失败');
    }
  }

  private async commitRepro(module: 'repro', batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.module !== module)
      throw new NotFoundException('batch不存在');
    if (batch.status !== 'validated')
      throw new BadRequestException('batch状态不允许提交');

    const errorCount = await this.rowErrors.count({
      where: { batchId: batch.id },
    });
    if (errorCount > 0) throw new BadRequestException('存在错误，无法提交');

    const payload = (batch.payloadJson ??
      null) as unknown as ReproPayload | null;
    if (!payload || !Array.isArray(payload.groups)) {
      throw new BadRequestException('batch缺少payload');
    }

    try {
      const inserted = await this.batches.manager.transaction(
        async (manager) => {
          const litterRepo = manager.getRepository(ReproLitterEntity);
          const pigletRepo = manager.getRepository(ReproPigletEntity);

          let count = 0;

          for (const g of payload.groups) {
            const expected = this.computeReproLitterExpected(g.litter);
            if (expected.error) {
              throw new BadRequestException(expected.error.message);
            }

            const incoming: Partial<ReproLitterEntity> = {
              unitId: batch.unitId,
              damEarTagNo: g.damEarTagNo,
              farrowingDate: g.farrowingDate,
              boarEarTagNo: g.litter.boarEarTagNo,
              matingDate: g.litter.matingDate,
              parity: g.litter.parity,
              maleBorn: g.litter.maleBorn,
              femaleBorn: g.litter.femaleBorn,
              totalBorn: expected.computed.totalBorn,
              stillbornCount: g.litter.stillbornCount,
              mummyCount: g.litter.mummyCount,
              malformedCount: g.litter.malformedCount,
              liveCount: expected.computed.liveCount,
              weakCount: g.litter.weakCount,
              weanDate: g.litter.weanDate,
              weanCount: g.litter.weanCount,
              weanLitterWeightKg: g.litter.weanLitterWeightKg,
              remark: g.litter.remark,
            };

            let litter =
              (await litterRepo.findOne({
                where: {
                  damEarTagNo: g.damEarTagNo,
                  farrowingDate: g.farrowingDate,
                },
              })) ?? null;

            if (litter) {
              if (litter.unitId !== batch.unitId) {
                throw new BadRequestException('同一窝已存在但所属单位不一致');
              }
              if (!this.isSameReproLitterEntity(litter, incoming)) {
                throw new BadRequestException('同一窝已存在但窝级字段冲突');
              }
            } else {
              litter = await litterRepo.save(litterRepo.create(incoming));
            }

            for (let i = 0; i < g.piglets.length; i += 200) {
              const chunk = g.piglets.slice(i, i + 200).map((p) => ({
                litterId: litter!.id,
                pigId: p.pigId,
                birthWeightKg: p.birthWeightKg,
                leftTeats: p.leftTeats,
                rightTeats: p.rightTeats,
                weanWeightIndKg: p.weanWeightIndKg,
                remark: p.remark,
              }));
              if (chunk.length > 0) {
                await pigletRepo.insert(chunk);
                count += chunk.length;
              }
            }
          }

          await manager
            .getRepository(ImportBatchEntity)
            .update({ id: batch.id }, { status: 'committed' });
          return count;
        },
      );

      return { ok: true, inserted };
    } catch (e: any) {
      await this.batches.update({ id: batch.id }, { status: 'failed' });
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('提交失败：唯一键冲突');
      }
      throw new BadRequestException('提交失败');
    }
  }

  private async commitCarcass(module: 'carcass', batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.module !== module)
      throw new NotFoundException('batch不存在');
    if (batch.status !== 'validated')
      throw new BadRequestException('batch状态不允许提交');

    const errorCount = await this.rowErrors.count({
      where: { batchId: batch.id },
    });
    if (errorCount > 0) throw new BadRequestException('存在错误，无法提交');

    const payload = (batch.payloadJson ??
      null) as unknown as CarcassPayload | null;
    if (!payload || !Array.isArray(payload.rows)) {
      throw new BadRequestException('batch缺少payload');
    }

    try {
      const inserted = await this.batches.manager.transaction(
        async (manager) => {
          const carcassRepo = manager.getRepository(CarcassTraitEntity);
          let count = 0;
          for (let i = 0; i < payload.rows.length; i += 200) {
            const chunk = payload.rows.slice(i, i + 200).map((r) => ({
              pigId: r.pigId,
              slaughterDate: r.slaughterDate,
              sex: null,
              preSlaughterWeightKg: r.preSlaughterWeightKg,
              carcassWeightLeftKg: r.carcassWeightLeftKg,
              carcassWeightRightKg: r.carcassWeightRightKg,
              carcassLengthCm: r.carcassLengthCm,
              bodyObliqueLengthCm: r.bodyObliqueLengthCm,
              backfatShoulderMm: r.backfatShoulderMm,
              backfatLastRibMm: r.backfatLastRibMm,
              backfatLumbarMm: r.backfatLumbarMm,
              skinThickness6_7RibMm: r.skinThickness6_7RibMm,
              emaLastRibCm2: r.emaLastRibCm2,
              emaHeightCm: r.emaHeightCm,
              emaWidthCm: r.emaWidthCm,
              leftDetachSkinKg: r.leftDetachSkinKg,
              leftDetachBoneKg: r.leftDetachBoneKg,
              leftDetachFatKg: r.leftDetachFatKg,
              leftDetachLeanKg: r.leftDetachLeanKg,
              ribCount: r.ribCount,
              detachLossPct: r.detachLossPct,
              hoofWeightKg: r.hoofWeightKg,
              headWeightKg: r.headWeightKg,
              leftLegWeightKg: r.leftLegWeightKg,
              legHipRatioPct: r.legHipRatioPct,
              skinRatePct: r.skinRatePct,
              boneRatePct: r.boneRatePct,
              fatRatePct: r.fatRatePct,
              leanRatePct: r.leanRatePct,
              slaughterRatePct: r.slaughterRatePct,
              remark: r.remark,
            }));
            if (chunk.length > 0) {
              await carcassRepo.insert(chunk);
              count += chunk.length;
            }
          }

          await manager
            .getRepository(ImportBatchEntity)
            .update({ id: batch.id }, { status: 'committed' });
          return count;
        },
      );
      return { ok: true, inserted };
    } catch (e: any) {
      await this.batches.update({ id: batch.id }, { status: 'failed' });
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('提交失败：唯一键冲突');
      }
      throw new BadRequestException('提交失败');
    }
  }

  private async commitMeatq(module: 'meatq', batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.module !== module)
      throw new NotFoundException('batch不存在');
    if (batch.status !== 'validated')
      throw new BadRequestException('batch状态不允许提交');

    const errorCount = await this.rowErrors.count({
      where: { batchId: batch.id },
    });
    if (errorCount > 0) throw new BadRequestException('存在错误，无法提交');

    const payload = (batch.payloadJson ??
      null) as unknown as MeatqPayload | null;
    if (!payload || !Array.isArray(payload.rows)) {
      throw new BadRequestException('batch缺少payload');
    }

    try {
      const inserted = await this.batches.manager.transaction(
        async (manager) => {
          const meatqRepo = manager.getRepository(MeatQualityEntity);
          let count = 0;
          for (let i = 0; i < payload.rows.length; i += 200) {
            const chunk = payload.rows.slice(i, i + 200).map((r) => ({
              pigId: r.pigId,
              sex: r.sex,
              colorScore: r.colorScore,
              colorL: r.colorL,
              colorA: r.colorA,
              colorB: r.colorB,
              ph1h: r.ph1h,
              ph24h: r.ph24h,
              dripLossPct: r.dripLossPct,
              waterHoldingPct: r.waterHoldingPct,
              marblingScore: r.marblingScore,
              imfPct: r.imfPct,
              impPct: r.impPct,
              moisturePct: r.moisturePct,
              tendernessShearN: r.tendernessShearN,
              cookedMeatRate: r.cookedMeatRate,
              remark: r.remark,
            }));
            if (chunk.length > 0) {
              await meatqRepo.insert(chunk);
              count += chunk.length;
            }
          }

          await manager
            .getRepository(ImportBatchEntity)
            .update({ id: batch.id }, { status: 'committed' });
          return count;
        },
      );
      return { ok: true, inserted };
    } catch (e: any) {
      await this.batches.update({ id: batch.id }, { status: 'failed' });
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('提交失败：唯一键冲突');
      }
      throw new BadRequestException('提交失败');
    }
  }

  private async commitBaseInfo(module: 'base_info', batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.module !== module)
      throw new NotFoundException('batch不存在');
    if (batch.status !== 'validated')
      throw new BadRequestException('batch状态不允许提交');

    const errorCount = await this.rowErrors.count({
      where: { batchId: batch.id },
    });
    if (errorCount > 0) throw new BadRequestException('存在错误，无法提交');

    const payload = (batch.payloadJson ??
      null) as unknown as { row?: BaseInfoPayload | null } | null;
    const row = payload?.row ?? null;
    if (!row) throw new BadRequestException('batch缺少payload');

    try {
      const inserted = await this.batches.manager.transaction(
        async (manager) => {
          const repo = manager.getRepository(ConservationBaseInfoEntity);

          const exists = await repo.findOne({
            where: { unitId: row.unitId, year: row.year },
          });
          if (exists) throw new BadRequestException('base_info 记录已存在');

          await repo.insert({
            unitId: row.unitId,
            year: row.year,
            data: row.data as any,
            fillDate: row.fillDate,
          });

          await manager
            .getRepository(ImportBatchEntity)
            .update({ id: batch.id }, { status: 'committed' });
          return 1;
        },
      );
      return { ok: true, inserted };
    } catch (e: any) {
      await this.batches.update({ id: batch.id }, { status: 'failed' });
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('提交失败：唯一键冲突');
      }
      if (typeof e?.message === 'string') {
        throw new BadRequestException(e.message);
      }
      throw new BadRequestException('提交失败');
    }
  }

  private countErroredRows(errors: RowError[]): number {
    if (errors.length === 0) return 0;
    const set = new Set(errors.map((e) => e.rowNumber));
    return set.size;
  }

  private isSameReproLitterInput(
    a: ReproLitterGroup['litter'],
    b: ReproLitterGroup['litter'],
  ): boolean {
    const eq = (x: unknown, y: unknown) => (x == null && y == null) || x === y;
    const fields: (keyof ReproLitterGroup['litter'])[] = [
      'boarEarTagNo',
      'matingDate',
      'parity',
      'maleBorn',
      'femaleBorn',
      'stillbornCount',
      'mummyCount',
      'malformedCount',
      'weakCount',
      'weanDate',
      'weanCount',
      'weanLitterWeightKg',
      'remark',
    ];
    for (const f of fields) {
      if (!eq(a[f], b[f])) return false;
    }
    return true;
  }

  private computeReproLitterExpected(litter: ReproLitterGroup['litter']): {
    computed: { totalBorn: number | null; liveCount: number | null };
    error: { field: string | null; message: string } | null;
  } {
    const maleBorn = litter.maleBorn;
    const femaleBorn = litter.femaleBorn;
    const stillbornCount = litter.stillbornCount;
    const mummyCount = litter.mummyCount;
    const malformedCount = litter.malformedCount;
    const weakCount = litter.weakCount;

    const totalBorn =
      maleBorn != null && femaleBorn != null ? maleBorn + femaleBorn : null;
    const liveCount =
      totalBorn != null &&
      stillbornCount != null &&
      mummyCount != null &&
      malformedCount != null
        ? totalBorn - stillbornCount - mummyCount - malformedCount
        : null;

    if (liveCount != null && weakCount != null && weakCount > liveCount) {
      return {
        computed: { totalBorn, liveCount },
        error: { field: 'weak_count', message: '弱仔数不能大于活仔数' },
      };
    }
    return { computed: { totalBorn, liveCount }, error: null };
  }

  private isSameReproLitterEntity(
    existing: ReproLitterEntity,
    incoming: Partial<ReproLitterEntity>,
  ): boolean {
    const eq = (x: unknown, y: unknown) => (x == null && y == null) || x === y;
    const fields: (keyof ReproLitterEntity)[] = [
      'unitId',
      'damEarTagNo',
      'farrowingDate',
      'boarEarTagNo',
      'matingDate',
      'parity',
      'maleBorn',
      'femaleBorn',
      'totalBorn',
      'stillbornCount',
      'mummyCount',
      'malformedCount',
      'liveCount',
      'weakCount',
      'weanDate',
      'weanCount',
      'weanLitterWeightKg',
      'remark',
    ];
    for (const f of fields) {
      if (typeof incoming[f] === 'undefined') continue;
      if (!eq(existing[f], incoming[f])) return false;
    }
    return true;
  }

  private computeGrowthDerived(
    birthDate: string,
    startDate: string | null,
    startWeightKg: number | null,
    endDate: string | null,
    endWeightKg: number | null,
    feedKg: number | null,
    targetWeightKg: number | null,
  ): Pick<
    GrowthPayloadRow,
    | 'startAgeDays'
    | 'endAgeDays'
    | 'testDays'
    | 'adgG'
    | 'adfiKg'
    | 'fcr'
    | 'dtswDays'
  > {
    const startAgeDays =
      startDate != null ? this.diffDays(startDate, birthDate) : null;
    const endAgeDays =
      endDate != null ? this.diffDays(endDate, birthDate) : null;
    const testDays =
      startDate != null && endDate != null ? this.diffDays(endDate, startDate) : null;

    let adgG: number | null = null;
    let adfiKg: number | null = null;
    let fcr: number | null = null;

    if (
      testDays != null &&
      testDays > 0 &&
      startWeightKg != null &&
      endWeightKg != null
    ) {
      const gain = endWeightKg - startWeightKg;
      adgG = gain > 0 ? (gain * 1000) / testDays : null;
      adfiKg = feedKg != null ? feedKg / testDays : null;
      fcr = feedKg != null && gain > 0 ? feedKg / gain : null;
    }

    const dtswDays = this.computeDtswDays(
      startDate,
      endDate,
      startAgeDays,
      testDays,
      startWeightKg,
      endWeightKg,
      targetWeightKg,
    );

    return { startAgeDays, endAgeDays, testDays, adgG, adfiKg, fcr, dtswDays };
  }

  private computeDtswDays(
    startDate: string | null,
    endDate: string | null,
    startAgeDays: number | null,
    testDays: number | null,
    startWeightKg: number | null,
    endWeightKg: number | null,
    targetWeightKg: number | null,
  ): number | null {
    if (!startDate || !endDate) return null;
    if (testDays == null || testDays <= 0) return null;
    if (startAgeDays == null) return null;
    if (startWeightKg == null || endWeightKg == null) return null;
    if (!targetWeightKg) return null;

    if (endWeightKg < targetWeightKg) return null;
    const gain = endWeightKg - startWeightKg;
    if (gain <= 0) return null;

    const frac = (targetWeightKg - startWeightKg) / gain;
    if (frac < 0) return startAgeDays;
    if (frac > 1) return null;

    const daysToTarget = Math.round(frac * testDays);
    return startAgeDays + daysToTarget;
  }

  private compareGrowthDerivedWithSheet(
    row: ExcelJS.Row,
    colIndexByKey: Record<string, number | null>,
    computed: {
      startAgeDays: number | null;
      endAgeDays: number | null;
      testDays: number | null;
      adgG: number | null;
      adfiKg: number | null;
      fcr: number | null;
      dtswDays: number | null;
    },
  ): string[] {
    const out: string[] = [];
    const pairs: Array<
      [keyof typeof computed, string, (a: any, b: any) => boolean]
    > = [
      ['startAgeDays', 'start_age_days', (a, b) => a === b],
      ['endAgeDays', 'end_age_days', (a, b) => a === b],
      ['testDays', 'test_days', (a, b) => a === b],
      ['dtswDays', 'dtsw_days', (a, b) => a === b],
      ['adgG', 'adg_g', (a, b) => Math.abs(a - b) <= 1e-6],
      ['adfiKg', 'adfi_kg', (a, b) => Math.abs(a - b) <= 1e-6],
      ['fcr', 'fcr', (a, b) => Math.abs(a - b) <= 1e-6],
    ];

    for (const [field, key, eq] of pairs) {
      const idx = colIndexByKey[key];
      if (!idx) continue;
      const v = this.parseNumberCell(this.getCellValue(row, idx));
      if (v === undefined) continue;
      if (v == null) continue;
      const c = computed[field];
      if (c == null) {
        out.push(`${key} 复算为空`);
        continue;
      }
      if (!eq(c, v)) {
        out.push(`${key} 复算=${c} 表格=${v}`);
      }
    }
    return out;
  }

  private parseDateOrNull(v: unknown): string | null | undefined {
    if (this.isEmptyCell(v)) return null;
    const s = this.parseDateCell(v);
    if (!s) return undefined;
    return s;
  }

  private parseNumberCell(v: unknown): number | null | undefined {
    if (v == null) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s.length === 0) return null;
      const n = Number(s);
      if (!Number.isFinite(n)) return undefined;
      return n;
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return undefined;
      return v;
    }
    if (v instanceof Date) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }

  private parseIntCell(v: unknown): number | null | undefined {
    const n = this.parseNumberCell(v);
    if (n === undefined) return undefined;
    if (n == null) return null;
    if (Math.trunc(n) !== n) return undefined;
    return n;
  }

  private diffDays(a: string, b: string): number {
    const da = this.parseDateStrict(a).getTime();
    const db = this.parseDateStrict(b).getTime();
    return Math.round((da - db) / 86400000);
  }

  private parseDateStrict(s: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
      throw new BadRequestException('日期格式应为YYYY-MM-DD');
    return new Date(`${s}T00:00:00Z`);
  }

  private mapHeaders<K extends string, M extends Record<K, string[]>>(
    headerRow: ExcelJS.Row,
    aliasesByKey: M,
  ): Record<K, number | null> {
    const normalizedToKey = new Map<string, K>();
    for (const [k, aliases] of Object.entries(aliasesByKey) as [
      K,
      string[],
    ][]) {
      for (const a of aliases) normalizedToKey.set(this.normalizeHeader(a), k);
    }

    const out: Record<K, number | null> = {} as any;
    for (const k of Object.keys(aliasesByKey) as K[]) out[k] = null;

    for (let col = 1; col <= headerRow.cellCount; col++) {
      const raw = headerRow.getCell(col).value;
      const s = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
      const key = normalizedToKey.get(this.normalizeHeader(s));
      if (!key) continue;
      out[key] = out[key] ?? col;
    }
    return out;
  }

  private normalizeHeader(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[（）()]/g, '');
  }

  private normalizeText(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, '');
  }

  private getCellValue(row: ExcelJS.Row, colIndex: number | null): unknown {
    if (!colIndex) return null;
    const cell = row.getCell(colIndex);
    const v = cell.value as any;
    if (v && typeof v === 'object' && 'text' in v && typeof v.text === 'string')
      return v.text;
    if (v && typeof v === 'object' && 'result' in v) return v.result;
    return v;
  }

  private isEmptyCell(v: unknown): boolean {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim().length === 0;
    return false;
  }

  private parseStringCell(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v instanceof Date) return this.formatDate(v);
    return String(v);
  }

  private parseDateCell(v: unknown): string | null {
    if (v == null) return null;
    if (v instanceof Date) return this.formatDate(v);
    if (typeof v === 'number') {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (Number.isNaN(d.getTime())) return null;
      return this.formatDate(d);
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (s.length === 0) return null;
      const normalized = s.replace(/\//g, '-');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
      return normalized;
    }
    return null;
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private parseSex(v: string | null): Sex | null {
    if (v == null) return null;
    const s = v.trim();
    if (s.length === 0) return null;
    if (s === '公' || s === '公猪' || s === '雄' || s.toLowerCase() === 'm')
      return '公';
    if (s === '母' || s === '母猪' || s === '雌' || s.toLowerCase() === 'f')
      return '母';
    if (s === '未知' || s === '不详' || s.toLowerCase() === 'u') return '未知';
    return null;
  }

  private normalizeOptionalString(v: string | null): string | null {
    if (v == null) return null;
    const s = v.trim();
    return s.length === 0 ? null : s;
  }
}
