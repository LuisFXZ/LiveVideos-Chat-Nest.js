import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../entities/comment.entity';
import { LiveService } from './live.service';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    private liveService: LiveService,
  ) {}

  async create(commentData: any): Promise<Comment> {
    try {
      const live = await this.liveService.getLiveById(commentData.liveId);
      const comment = this.commentRepository.create({
        userName: commentData.userName,
        content: commentData.content,
        live: live
      });
      return await this.commentRepository.save(comment);
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  }

  async findByLiveId(liveId: number): Promise<Comment[]> {
    try {
      return await this.commentRepository.find({
        where: { live: { id: liveId } },
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error('Error finding comments:', error);
      throw error;
    }
  }
}
