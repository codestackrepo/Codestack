import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('demo_requests')
export class DemoRequest extends BaseEntity {
  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true, name: 'phone_number' })
  phoneNumber!: string | null;
}
