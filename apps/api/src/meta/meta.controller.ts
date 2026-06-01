import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BreedEntity, UnitEntity } from '../db/entities';

@Controller('meta')
export class MetaController {
  constructor(
    @InjectRepository(UnitEntity)
    private readonly units: Repository<UnitEntity>,
    @InjectRepository(BreedEntity)
    private readonly breeds: Repository<BreedEntity>,
  ) {}

  @Get('units')
  async listUnits() {
    const rows = await this.units.find({ order: { id: 'ASC' } });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      type: u.type,
      defaultBreedId: u.defaultBreedId,
    }));
  }

  @Get('breeds')
  async listBreeds() {
    const rows = await this.breeds.find({ order: { id: 'ASC' } });
    return rows.map((b) => ({ id: b.id, name: b.name }));
  }
}
