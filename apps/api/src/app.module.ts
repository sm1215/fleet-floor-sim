import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from '../database/entities/index.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CellModule } from './cell/cell.module.js';
import { EngineModule } from './engine/engine.module.js';
import { FloorModule } from './floor/floor.module.js';
import { LogEntryModule } from './log-entry/log-entry.module.js';
import { QueuedCommandModule } from './queued-command/queued-command.module.js';
import { RobotModule } from './robot/robot.module.js';

export const featureModules = [
  FloorModule,
  CellModule,
  RobotModule,
  QueuedCommandModule,
  LogEntryModule,
  EngineModule,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.getOrThrow<string>('DB_PATH'),
        entities,
        synchronize: false,
      }),
    }),
    ...featureModules,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
