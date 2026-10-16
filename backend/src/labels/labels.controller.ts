import { Body, Controller, Header, HttpCode, Post, StreamableFile } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
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

class LocationLabelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  locationIds: string[];

  /** Also print everything inside the selected locations (e.g. all spaces on a shelf). */
  @IsOptional()
  @IsBoolean()
  withChildren?: boolean;
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

  @Roles(...LABEL_PRINT)
  @Post('locations')
  @HttpCode(200)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="location-labels.pdf"')
  async locationLabels(@Body() dto: LocationLabelsDto) {
    return new StreamableFile(await this.labels.locationLabels(dto.locationIds, dto.withChildren ?? false));
  }
}
