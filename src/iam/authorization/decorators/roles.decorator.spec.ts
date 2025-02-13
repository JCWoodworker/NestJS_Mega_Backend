import { Reflector } from '@nestjs/core';

import { Role } from '@users/enums/role.enum';

import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles Decorator', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('should set roles metadata correctly', () => {
    @Roles(Role.Admin, Role.Basic)
    class TestClass {}

    const roles = reflector.get(ROLES_KEY, TestClass);

    expect(roles).toBeDefined();
    expect(roles).toHaveLength(2);
    expect(roles).toContain(Role.Admin);
    expect(roles).toContain(Role.Basic);
  });

  it('should handle empty roles array', () => {
    @Roles()
    class TestClass {}

    const roles = reflector.get(ROLES_KEY, TestClass);

    expect(roles).toBeDefined();
    expect(roles).toHaveLength(0);
    expect(Array.isArray(roles)).toBe(true);
  });

  it('should handle single role', () => {
    @Roles(Role.Admin)
    class TestClass {}

    const roles = reflector.get(ROLES_KEY, TestClass);

    expect(roles).toBeDefined();
    expect(roles).toHaveLength(1);
    expect(roles).toContain(Role.Admin);
  });
});
