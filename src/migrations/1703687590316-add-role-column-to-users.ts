import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRoleColumnToUsers1703687590316 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add "role" column to "users" table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'role',
        type: 'varchar',
        isNullable: true,
        default: `'basic'`,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'role');
  }
}
