import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BREED_NAMES, UNITS } from '@shapcd/pig-shared';
import { randomBytes } from 'crypto';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';
import { BreedEntity, UnitEntity, UserEntity } from './entities';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(UnitEntity)
    private readonly units: Repository<UnitEntity>,
    @InjectRepository(BreedEntity)
    private readonly breeds: Repository<BreedEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedBreeds();
    await this.seedUnits();
    await this.seedAdminUser();
  }

  private async seedBreeds(): Promise<void> {
    const existing = await this.breeds.find();
    const existingNames = new Set(existing.map((b) => b.name));
    const toCreate = BREED_NAMES.filter((n: string) => !existingNames.has(n)).map(
      (name) => this.breeds.create({ name }),
    );

    if (toCreate.length > 0) {
      await this.breeds.save(toCreate);
    }
  }

  private async seedUnits(): Promise<void> {
    const breeds = await this.breeds.find();
    const breedIdByName = new Map(breeds.map((b) => [b.name, b.id] as const));

    const existing = await this.units.find();
    const existingNames = new Set(existing.map((u: any) => u.name));

    const toCreate = UNITS.filter((u: any) => !existingNames.has(u.name)).map((u: any) =>
      this.units.create({
        name: u.name,
        type: u.type,
        defaultBreedId: u.defaultBreedName
          ? (breedIdByName.get(u.defaultBreedName) ?? null)
          : null,
      }),
    );

    if (toCreate.length > 0) {
      await this.units.save(toCreate);
    }
  }

  private async seedAdminUser(): Promise<void> {
    const adminUnitName = UNITS.find((u: any) => u.type === '管理单位')?.name;
    if (!adminUnitName) return;

    const adminUnit = await this.units.findOne({
      where: { name: adminUnitName },
    });
    if (!adminUnit) return;

    const existing = await this.users.findOne({
      where: { unitId: adminUnit.id },
    });
    if (existing) return;

    const username = process.env.ADMIN_USERNAME ?? 'admin';
    let password = process.env.ADMIN_INIT_PASSWORD;
    let shouldWrite = false;

    if (!password) {
      password = randomBytes(18).toString('base64url');
      shouldWrite = true;
    }

    const passwordHash = await hashPassword(password);

    await this.users.save(
      this.users.create({
        username,
        unitId: adminUnit.id,
        role: '管理单位',
        passwordHash,
        isActive: true,
      }),
    );

    if (shouldWrite) {
      const outPath = resolve(process.cwd(), 'admin-initial-password.txt');
      await writeFile(outPath, password, { encoding: 'utf-8' });
    }
  }
}

