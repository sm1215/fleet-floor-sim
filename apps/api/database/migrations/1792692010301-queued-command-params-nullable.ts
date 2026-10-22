import { MigrationInterface, QueryRunner } from 'typeorm';

export class QueuedCommandParamsNullable1792692010301 implements MigrationInterface {
  name = 'QueuedCommandParamsNullable1792692010301';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(
      `CREATE TABLE "temporary_queued_command" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "command" varchar NOT NULL, "params" varchar, "robot_id" integer, CONSTRAINT "FK_06f489de96e65af953d9654fe86" FOREIGN KEY ("robot_id") REFERENCES "robot" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "queued_command" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "command" varchar NOT NULL, "params" varchar NOT NULL, "robot_id" integer, CONSTRAINT "FK_06f489de96e65af953d9654fe86" FOREIGN KEY ("robot_id") REFERENCES "robot" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "queued_command"("id", "command", "params", "robot_id") SELECT "id", "command", "params", "robot_id" FROM "temporary_queued_command"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_queued_command"`);
    await queryRunner.query(
      `ALTER TABLE "queued_command" RENAME TO "temporary_queued_command"`,
    );
    await queryRunner.query(
      `CREATE TABLE "queued_command" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "command" varchar NOT NULL, "params" varchar NOT NULL, "robot_id" integer, CONSTRAINT "FK_06f489de96e65af953d9654fe86" FOREIGN KEY ("robot_id") REFERENCES "robot" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "queued_command"("id", "command", "params", "robot_id") SELECT "id", "command", "params", "robot_id" FROM "temporary_queued_command"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_queued_command"`);
  }
}
