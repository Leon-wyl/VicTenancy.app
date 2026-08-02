import { Module } from '@nestjs/common';
import { CitationController } from './citation.controller';
import { CitationService } from './citation.service';

@Module({
  controllers: [CitationController],
  providers: [CitationService],
})
export class CitationModule {}
