import { Controller, Post, Get, Body, Param, Put } from '@nestjs/common';
import { LiveService } from '../services/live.service';
import { Live } from '../entities/live.entity';

@Controller('lives')
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Post()
  async createLive(@Body() liveData: Partial<Live>) {
    return await this.liveService.createLive(liveData);
  }

  @Get()
  async getAllLives() {
    return await this.liveService.getAllLives();
  }

  @Get(':id')
  async getLive(@Param('id') id: number) {
    return await this.liveService.getLiveById(id);
  }

  @Put(':id/end')
  async endLive(@Param('id') id: number) {
    return await this.liveService.endLive(id);
  }
}
