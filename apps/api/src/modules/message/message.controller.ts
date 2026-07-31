import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  InternalServerErrorException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateMessageResponseDto } from './dto/create-message-response.dto';
import { MessageSummaryDto } from './dto/message-summary.dto';
import { PageResponse } from '../../common/pagination/page-response.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Principal } from '../../common/auth/principal';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { getRequestContext } from '../../common/correlation/correlation.context';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('/v1/conversations/:conversationId/messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  async findAll(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: PaginationDto,
  ): Promise<PageResponse<MessageSummaryDto>> {
    return this.messageService.findAllByConversation(
      user.sub,
      conversationId,
      query.limit ?? 20,
      query.cursor,
    );
  }

  @Post()
  async create(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateMessageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CreateMessageResponseDto> {
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new BadRequestException(
        'Missing or invalid Idempotency-Key header (must be a UUID)',
      );
    }

    const ctx = getRequestContext();
    if (!ctx?.requestId) {
      throw new InternalServerErrorException(
        'Request context unavailable',
      );
    }

    const { result, isReplay } = await this.messageService.create(
      user.sub,
      conversationId,
      dto,
      idempotencyKey,
      ctx.requestId,
    );

    res.status(isReplay ? HttpStatus.OK : HttpStatus.CREATED);
    return result;
  }
}
