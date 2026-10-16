import { LocationType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const MAX_LOCATIONS_PER_REQUEST = 100;

const CREATABLE_TYPES = [
  LocationType.SITE,
  LocationType.FLOOR,
  LocationType.ROOM,
  LocationType.SHELF,
  LocationType.SPACE,
] as const;

/** Creates one or more siblings at once, e.g. spaces A1…A6 on a shelf. */
export class CreateLocationsDto {
  /** Omit for a new site. */
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsIn(CREATABLE_TYPES)
  type: LocationType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LOCATIONS_PER_REQUEST)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(60, { each: true })
  names: string[];
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
