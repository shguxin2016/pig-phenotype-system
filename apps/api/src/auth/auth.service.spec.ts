import { Test } from '@nestjs/testing';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { DbModule } from '../db/db.module';

describe('AuthService', () => {
  it('logs in with username + unit + password', async () => {
    process.env.DB_TYPE = 'sqljs';
    process.env.DB_SQLJS_PATH = `data/test-${Date.now()}-${Math.random()}.sqlite`;
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_INIT_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [DbModule, AuthModule],
    }).compile();

    await moduleRef.init();

    const auth = moduleRef.get(AuthService);

    const result = await auth.login({
      username: 'admin',
      unitName: '上海市动物疫病预防控制中心',
      password: 'test-password',
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.user.username).toBe('admin');
    expect(result.user.role).toBe('管理单位');

    await moduleRef.close();
  });
});
