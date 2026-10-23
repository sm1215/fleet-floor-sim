import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Timeline (timeline.md): robot display_id unique per floor (no DB constraint),
 * log_entry gets floor_id and tick, new tick_history table. Existing log rows
 * go to the lowest floor; their tick is the number of TICK rows up to them.
 */
export class Timeline1792720822900 implements MigrationInterface {
  name = 'Timeline1792720822900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_robot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "direction" integer NOT NULL, "cell_id" integer, "display_id" integer NOT NULL, CONSTRAINT "FK_830ce9409d5dfcebcf02954b499" FOREIGN KEY ("cell_id") REFERENCES "cell" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_robot"("id", "direction", "cell_id", "display_id") SELECT "id", "direction", "cell_id", "display_id" FROM "robot"`,
    );
    await queryRunner.query(`DROP TABLE "robot"`);
    await queryRunner.query(`ALTER TABLE "temporary_robot" RENAME TO "robot"`);
    await queryRunner.query(
      `CREATE TABLE "tick_history" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tick" integer NOT NULL, "state" varchar NOT NULL, "floor_id" integer, CONSTRAINT "UQ_0ac79b2577acab937d14d9d671e" UNIQUE ("floor_id", "tick"), CONSTRAINT "FK_69c7e70f8102d8b48b6902261b7" FOREIGN KEY ("floor_id") REFERENCES "floor" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_log_entry" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "action" varchar NOT NULL, "params" varchar NOT NULL, "result" varchar NOT NULL, "tick" integer NOT NULL, "floor_id" integer, CONSTRAINT "FK_96f02d8d1a7a68e9f9e6c424329" FOREIGN KEY ("floor_id") REFERENCES "floor" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_log_entry"("id", "action", "params", "result", "tick", "floor_id") SELECT "id", "action", "params", "result", (SELECT COUNT(*) FROM "log_entry" t WHERE t."action" = 'TICK' AND t."id" <= "log_entry"."id"), (SELECT MIN("id") FROM "floor") FROM "log_entry"`,
    );
    await queryRunner.query(`DROP TABLE "log_entry"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_log_entry" RENAME TO "log_entry"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_log_entry" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "action" varchar NOT NULL, "params" varchar NOT NULL, "result" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_log_entry"("id", "action", "params", "result") SELECT "id", "action", "params", "result" FROM "log_entry"`,
    );
    await queryRunner.query(`DROP TABLE "log_entry"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_log_entry" RENAME TO "log_entry"`,
    );
    await queryRunner.query(`DROP TABLE "tick_history"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_robot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "direction" integer NOT NULL, "cell_id" integer, "display_id" integer NOT NULL, CONSTRAINT "UQ_028b62b26f49fbf8d7be8109618" UNIQUE ("display_id"), CONSTRAINT "FK_830ce9409d5dfcebcf02954b499" FOREIGN KEY ("cell_id") REFERENCES "cell" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_robot"("id", "direction", "cell_id", "display_id") SELECT "id", "direction", "cell_id", "display_id" FROM "robot"`,
    );
    await queryRunner.query(`DROP TABLE "robot"`);
    await queryRunner.query(`ALTER TABLE "temporary_robot" RENAME TO "robot"`);
  }
}
