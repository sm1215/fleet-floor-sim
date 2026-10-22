import { MigrationInterface, QueryRunner } from 'typeorm';

export class RobotDisplayId1792699307727 implements MigrationInterface {
  name = 'RobotDisplayId1792699307727';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_robot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "direction" integer NOT NULL, "cell_id" integer, "display_id" integer NOT NULL, CONSTRAINT "UQ_028b62b26f49fbf8d7be8109618" UNIQUE ("display_id"), CONSTRAINT "FK_830ce9409d5dfcebcf02954b499" FOREIGN KEY ("cell_id") REFERENCES "cell" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_robot"("id", "direction", "cell_id", "display_id") SELECT "id", "direction", "cell_id", "id" FROM "robot"`,
    );
    await queryRunner.query(`DROP TABLE "robot"`);
    await queryRunner.query(`ALTER TABLE "temporary_robot" RENAME TO "robot"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "robot" RENAME TO "temporary_robot"`);
    await queryRunner.query(
      `CREATE TABLE "robot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "direction" integer NOT NULL, "cell_id" integer, CONSTRAINT "FK_830ce9409d5dfcebcf02954b499" FOREIGN KEY ("cell_id") REFERENCES "cell" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "robot"("id", "direction", "cell_id") SELECT "id", "direction", "cell_id" FROM "temporary_robot"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_robot"`);
  }
}
