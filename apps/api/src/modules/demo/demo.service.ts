import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { DemoRequest } from './entities/demo-request.entity';

@Injectable()
export class DemoService {
  constructor(
    @InjectRepository(DemoRequest) private readonly demoRequests: Repository<DemoRequest>,
  ) {}

  create(dto: CreateDemoRequestDto): Promise<DemoRequest> {
    return this.demoRequests.save(
      this.demoRequests.create({
        fullName: dto.fullName,
        email: dto.email,
        phoneNumber: dto.phoneNumber ?? null,
      }),
    );
  }
}
