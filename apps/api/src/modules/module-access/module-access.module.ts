import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleAccess } from './entities/module-access.entity';
import { ModuleAccessController } from './module-access.controller';
import { ModuleAccessService } from './module-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModuleAccess])],
  controllers: [ModuleAccessController],
  providers: [ModuleAccessService],
  exports: [ModuleAccessService],
})
export class ModuleAccessModule {}
