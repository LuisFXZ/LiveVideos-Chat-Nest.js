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
    try {
      const live = this.liveRepository.create(liveData);
      return await this.liveRepository.save(live);
    } catch (error) {
      console.error('Error creating live:', error);
      throw error;
    }
  }

  async getAllLives(): Promise<Live[]> {
    try {
      return await this.liveRepository.find({
        order: { 
          isActive: 'DESC',  // Mostrar primero los lives activos
          createdAt: 'DESC' // Luego ordenar por fecha de creación
        }
      });
    } catch (error) {
      console.error('Error getting all lives:', error);
      throw error;
    }
  }

  async getLiveById(id: number): Promise<Live> {
    try {
      const live = await this.liveRepository.findOne({
        where: { id },
        relations: ['comments']
      });
      if (!live) {
        throw new Error('Live not found');
      }
      return live;
    } catch (error) {
      console.error('Error getting live by id:', error);
      throw error;
    }
  }

  async endLive(id: number): Promise<Live> {
    const live = await this.getLiveById(id);
    live.isActive = false;
    return await this.liveRepository.save(live);
  }

  async updateLiveStatus(liveId: number, isActive: boolean): Promise<Live> {
    try {
      const live = await this.getLiveById(liveId);
      live.isActive = isActive;
      return await this.liveRepository.save(live);
    } catch (error) {
      console.error('Error updating live status:', error);
      throw error;
    }
  }

  async findAll(): Promise<Live[]> {
    return this.liveRepository.find();
  }

  async findOne(id: number): Promise<Live> {
    return this.liveRepository.findOne({ where: { id } });
  }
}
