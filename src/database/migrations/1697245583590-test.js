module.exports = class Test1697245583590 {
  async up(queryRunner) {
    await queryRunner.query(`CREATE TABLE "testing"`);
  }

  async down(queryRunner) {
    await queryRunner.query(`DELETE TABLE "testing"`);
  }
};
