import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';
import { PageResponse } from '../../common/pagination/page-response.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Principal } from '../../common/auth/principal';
import { PaginationDto } from '../../common/dto/pagination.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('/v1/conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  async findAll(
    @CurrentUser() user: Principal,
    @Query() query: PaginationDto,
  ): Promise<PageResponse<ConversationSummaryDto>> {
    return this.conversationService.findAllByUser(
      user.sub,
      query.limit ?? 20,
      query.cursor,
    );
  }

  @Post()
  async create(
    @CurrentUser() user: Principal,
    @Body() dto: CreateConversationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ConversationSummaryDto> {
    if (idempotencyKey && !UUID_RE.test(idempotencyKey)) {
      throw new BadRequestException(
        'Invalid Idempotency-Key header (must be a UUID)',
      );
    }
    return this.conversationService.create(user.sub, dto, idempotencyKey);
  }

  @Get(':conversationId')
  async findOne(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<ConversationSummaryDto> {
    return this.conversationService.findOne(user.sub, conversationId);
  }

  @Patch(':conversationId')
  async update(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationSummaryDto> {
    return this.conversationService.update(user.sub, conversationId, dto);
  }

  @Delete(':conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<void> {
    await this.conversationService.delete(user.sub, conversationId);
  }
}
