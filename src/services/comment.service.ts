import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../entities/comment.entity';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
  ) {}

  async createComment(commentData: Partial<Comment>): Promise<Comment> {
    const comment = this.commentRepository.create(commentData);
    return await this.commentRepository.save(comment);
  }

  async getCommentsByLiveId(liveId: number): Promise<Comment[]> {
    return await this.commentRepository.find({
      where: { live: { id: liveId } },
      order: { createdAt: 'DESC' },
    });
  }
}
