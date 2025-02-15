import { filterObject } from './filter-object';

describe('Utils', () => {
  describe('filterObject', () => {
    it('should filter object based on allowed keys', () => {
      const input = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
        password: 'secret',
      };

      type InputType = typeof input;
      const allowedKeys: (keyof InputType)[] = ['name', 'email'];
      const result = filterObject(input, allowedKeys);

      expect(result).toEqual({
        name: 'John',
        email: 'john@example.com',
      });
    });

    it('should return empty object when no keys are allowed', () => {
      const input = {
        name: 'John',
        age: 30,
      };

      type InputType = typeof input;
      const allowedKeys: (keyof InputType)[] = [];
      const result = filterObject(input, allowedKeys);

      expect(result).toEqual({});
    });

    it('should handle empty input object', () => {
      const input = {} as Record<string, unknown>;
      type InputType = typeof input;
      const allowedKeys: (keyof InputType)[] = [];
      const result = filterObject(input, allowedKeys);

      expect(result).toEqual({});
    });

    it('should handle non-existent keys', () => {
      const input = {
        name: 'John',
        age: 30,
      };

      type InputType = typeof input;
      const allowedKeys: (keyof InputType)[] = ['name'];
      const result = filterObject(input, allowedKeys);

      expect(result).toEqual({
        name: 'John',
      });
    });

    it('should preserve value types', () => {
      const input = {
        string: 'text',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { key: 'value' },
        null: null,
        undefined: undefined,
      };

      type InputType = typeof input;
      const allowedKeys: (keyof InputType)[] = [
        'string',
        'number',
        'boolean',
        'array',
        'object',
        'null',
        'undefined',
      ];
      const result = filterObject(input, allowedKeys);

      expect(result).toEqual(input);
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          settings: {
            theme: 'dark',
          },
        },
        preferences: {
          notifications: true,
        },
      };

      type InputType = typeof input;
      const allowedKeys: (keyof InputType)[] = ['user'];
      const result = filterObject(input, allowedKeys);

      expect(result).toEqual({
        user: {
          name: 'John',
          settings: {
            theme: 'dark',
          },
        },
      });
    });
  });
});
