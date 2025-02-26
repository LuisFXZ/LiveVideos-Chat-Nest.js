import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CommentService } from '../services/comment.service';
import { Comment } from '../entities/comment.entity';

@Controller('api/comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  async create(@Body() commentData: any): Promise<Comment> {
    return this.commentService.create(commentData);
  }

  @Get('live/:liveId')
  async findByLiveId(@Param('liveId') liveId: string): Promise<Comment[]> {
    return this.commentService.findByLiveId(Number(liveId));
  }
}
