import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { LiveController } from './controllers/live.controller';
import { LiveService } from './services/live.service';
import { Live } from './entities/live.entity';
import { Comment } from './entities/comment.entity';
import { LiveGateway } from './gateways/live.gateway';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [Live, Comment],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Live, Comment]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
  ],
  controllers: [LiveController],
  providers: [LiveService, LiveGateway],
})
export class AppModule {}
