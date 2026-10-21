import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1792609879396 implements MigrationInterface {
  name = 'Init1792609879396';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "floor" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "height" integer NOT NULL, "width" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "cell" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "obstacle" boolean NOT NULL, "x_position" integer NOT NULL, "y_position" integer NOT NULL, "floor_id" integer, CONSTRAINT "UQ_de5386257addcba33208013683d" UNIQUE ("floor_id", "x_position", "y_position"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "log_entry" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "action" varchar NOT NULL, "params" varchar NOT NULL, "result" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "robot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "direction" integer NOT NULL, "cell_id" integer)`,
    );
    await queryRunner.query(
      `CREATE TABLE "queued_command" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "command" varchar NOT NULL, "params" varchar NOT NULL, "robot_id" integer)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_cell" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "obstacle" boolean NOT NULL, "x_position" integer NOT NULL, "y_position" integer NOT NULL, "floor_id" integer, CONSTRAINT "UQ_de5386257addcba33208013683d" UNIQUE ("floor_id", "x_position", "y_position"), CONSTRAINT "FK_6fbcda1e8e19702cdc2d80c9aaa" FOREIGN KEY ("floor_id") REFERENCES "floor" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_cell"("id", "obstacle", "x_position", "y_position", "floor_id") SELECT "id", "obstacle", "x_position", "y_position", "floor_id" FROM "cell"`,
    );
    await queryRunner.query(`DROP TABLE "cell"`);
    await queryRunner.query(`ALTER TABLE "temporary_cell" RENAME TO "cell"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_robot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "direction" integer NOT NULL, "cell_id" integer, CONSTRAINT "FK_830ce9409d5dfcebcf02954b499" FOREIGN KEY ("cell_id") REFERENCES "cell" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_robot"("id", "direction", "cell_id") SELECT "id", "direction", "cell_id" FROM "robot"`,
    );
    await queryRunner.query(`DROP TABLE "robot"`);
    await queryRunner.query(`ALTER TABLE "temporary_robot" RENAME TO "robot"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_queued_command" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "command" varchar NOT NULL, "params" varchar NOT NULL, "robot_id" integer, CONSTRAINT "FK_06f489de96e65af953d9654fe86" FOREIGN KEY ("robot_id") REFERENCES "robot" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_queued_command"("id", "command", "params", "robot_id") SELECT "id", "command", "params", "robot_id" FROM "queued_command"`,
    );
    await queryRunner.query(`DROP TABLE "queued_command"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_queued_command" RENAME TO "queued_command"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queued_command" RENAME TO "temporary_queued_command"`,
    );
    await queryRunner.query(
      `CREATE TABLE "queued_command" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "command" varchar NOT NULL, "params" varchar NOT NULL, "robot_id" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "queued_command"("id", "command", "params", "robot_id") SELECT "id", "command", "params", "robot_id" FROM "temporary_queued_command"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_queued_command"`);
    await queryRunner.query(`ALTER TABLE "robot" RENAME TO "temporary_robot"`);
    await queryRunner.query(
      `CREATE TABLE "robot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "direction" integer NOT NULL, "cell_id" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "robot"("id", "direction", "cell_id") SELECT "id", "direction", "cell_id" FROM "temporary_robot"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_robot"`);
    await queryRunner.query(`ALTER TABLE "cell" RENAME TO "temporary_cell"`);
    await queryRunner.query(
      `CREATE TABLE "cell" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "obstacle" boolean NOT NULL, "x_position" integer NOT NULL, "y_position" integer NOT NULL, "floor_id" integer, CONSTRAINT "UQ_de5386257addcba33208013683d" UNIQUE ("floor_id", "x_position", "y_position"))`,
    );
    await queryRunner.query(
      `INSERT INTO "cell"("id", "obstacle", "x_position", "y_position", "floor_id") SELECT "id", "obstacle", "x_position", "y_position", "floor_id" FROM "temporary_cell"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_cell"`);
    await queryRunner.query(`DROP TABLE "queued_command"`);
    await queryRunner.query(`DROP TABLE "robot"`);
    await queryRunner.query(`DROP TABLE "log_entry"`);
    await queryRunner.query(`DROP TABLE "cell"`);
    await queryRunner.query(`DROP TABLE "floor"`);
  }
}
