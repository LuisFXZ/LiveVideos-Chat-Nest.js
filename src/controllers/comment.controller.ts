import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { CommentService } from '../services/comment.service';
import { Comment } from '../entities/comment.entity';

@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  async createComment(@Body() commentData: Partial<Comment>) {
    return await this.commentService.createComment(commentData);
  }

  @Get('live/:liveId')
  async getCommentsByLive(@Param('liveId') liveId: number) {
    return await this.commentService.getCommentsByLiveId(liveId);
  }
}
