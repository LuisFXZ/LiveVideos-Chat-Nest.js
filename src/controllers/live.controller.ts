import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe } from '@nestjs/common';
import { LiveService } from '../services/live.service';
import { Live } from '../entities/live.entity';

@Controller('api/lives')
export class LiveController {
  constructor(private readonly liveService: LiveService) { }

  @Post()
  async create(@Body() liveData: Partial<Live>): Promise<Live> {
    try {
      console.log('Creating live with data:', liveData);
      liveData.isActive = true;
      const result = await this.liveService.createLive(liveData);
      console.log('Live created:', result);
      return result;
    } catch (error) {
      console.error('Error in create live controller:', error);
      throw error;
    }
  }

  @Get()
  async findAll(): Promise<Live[]> {
    return this.liveService.getAllLives();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Live> {
    return this.liveService.getLiveById(Number(id));
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ): Promise<Live> {
    return this.liveService.updateLiveStatus(Number(id), isActive);
  }

  @Delete(':id')
  async deleteLiveId(@Param('id', ParseIntPipe) id: number) {
    return this.liveService.deleteLive(id)
  }

}
