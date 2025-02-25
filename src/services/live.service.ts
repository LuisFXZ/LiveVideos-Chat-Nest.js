import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Live } from '../entities/live.entity';

@Injectable()
export class LiveService {
  constructor(
    @InjectRepository(Live)
    private liveRepository: Repository<Live>,
  ) {}

  async createLive(liveData: Partial<Live>): Promise<Live> {
    const live = this.liveRepository.create(liveData);
    return await this.liveRepository.save(live);
  }

  async getAllLives(): Promise<Live[]> {
    return await this.liveRepository.find({
      where: { isActive: true },
      relations: ['comments'],
      order: { createdAt: 'DESC' },
    });
  }

  async getLiveById(id: number): Promise<Live> {
    return await this.liveRepository.findOne({
      where: { id },
      relations: ['comments'],
    });
  }

  async endLive(id: number): Promise<Live> {
    const live = await this.getLiveById(id);
    live.isActive = false;
    return await this.liveRepository.save(live);
  }
}
