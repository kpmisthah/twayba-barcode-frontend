import { Body, Controller, Header, HttpCode, Post, StreamableFile } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LABEL_PRINT } from '../auth/role-groups.js';
import { LabelsService } from './labels.service.js';

class LabelItemDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(500)
  copies: number;
}

class ProductLabelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LabelItemDto)
  items: LabelItemDto[];
}

@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Roles(...LABEL_PRINT)
  @Post('products')
  @HttpCode(200)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="labels.pdf"')
  async productLabels(@Body() dto: ProductLabelsDto) {
    return new StreamableFile(await this.labels.productLabels(dto.items));
  }
}
