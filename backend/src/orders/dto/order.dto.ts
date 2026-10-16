import { DeliveryExceptionType, OrderPayment, OrderStatus, ReturnCondition } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  Matches,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class OrderDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsEnum(OrderPayment)
  paymentStatus?: OrderPayment;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  codAmount?: number;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timeWindow?: string;
}

export class OrderLineDto {
  /** A STANDARD variant or a KIT variant (whole kit). */
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;
}

export class CreateOrderDto extends OrderDetailsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  customerName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines: OrderLineDto[];
}

export class UpdateOrderDto extends OrderDetailsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  customerName?: string;
}

export class AllocationDto {
  @IsUUID()
  lineId: string;

  @IsUUID()
  variantId: string;

  @IsUUID()
  locationId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;
}

export class AllocateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations: AllocationDto[];
}

export class ApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  login: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class PickDto {
  /** What was scanned. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code: string;

  /** Where the picker is standing. */
  @IsUUID()
  locationId: string;

  /** Taking it from a different place than allocated needs a manager. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ApprovalDto)
  approval?: ApprovalDto;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ShortPickDto {
  @ValidateNested()
  @Type(() => ApprovalDto)
  approval: ApprovalDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

export class ReturnScanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code: string;

  @IsEnum(ReturnCondition)
  condition: ReturnCondition;

  /** Where a good item goes back to. */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class ListOrdersQuery {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Only orders still to be done (new → out for delivery, and failed). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  open?: boolean;

  /** Delivered since this time (e.g. today's done list). */
  @IsOptional()
  @IsDateString()
  deliveredSince?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// ---------------------------------------------------------------- delivery

const DELIVERY_PHOTO = /^\/uploads\/deliveries\/[a-f0-9-]{36}\.(jpg|png|webp)$/;

export class AssignDriverDto {
  /** Required: send null explicitly to remove the driver (a missing field must not unassign). */
  @ValidateIf((o: AssignDriverDto) => o.driverId !== null)
  @IsUUID()
  driverId: string | null;
}

export class DeliveredItemDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;
}

export class DeliverDto {
  /** Only for a partial delivery: what the customer actually took. Omit = everything on the van. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DeliveredItemDto)
  items?: DeliveredItemDto[];

  /** Cash collected — required for cash-on-delivery orders. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  codCollected?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @Matches(DELIVERY_PHOTO, { message: 'photo must be uploaded through the app' })
  photoUrl?: string;

  /** A partial delivery needs an admin/manager (unless one is delivering). */
  @IsOptional()
  @ValidateNested()
  @Type(() => ApprovalDto)
  approval?: ApprovalDto;
}

export const FAIL_REASONS = [
  DeliveryExceptionType.NOT_HOME,
  DeliveryExceptionType.CUSTOMER_REFUSED,
  DeliveryExceptionType.WRONG_ADDRESS,
  DeliveryExceptionType.DAMAGED_BOX,
  DeliveryExceptionType.MISSING_BOX,
  DeliveryExceptionType.OTHER,
] as const;

export class FailDeliveryDto {
  @IsIn(FAIL_REASONS)
  reason: (typeof FAIL_REASONS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;

  @IsOptional()
  @Matches(DELIVERY_PHOTO, { message: 'photo must be uploaded through the app' })
  photoUrl?: string;
}

export class ReportExceptionDto {
  @IsEnum(DeliveryExceptionType)
  type: DeliveryExceptionType;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  /** Responsible location (e.g. the space a damaged box came from). */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;

  @IsOptional()
  @Matches(DELIVERY_PHOTO, { message: 'photo must be uploaded through the app' })
  photoUrl?: string;
}

// ---------------------------------------------------------------- website webhook

export class WebhookItemDto {
  /** Our SKU (preferred) or any barcode of the item. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;
}

export class WebhookOrderDto extends OrderDetailsDto {
  /** The website's own order id/number. Sending the same one again returns the existing order. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  customerName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WebhookItemDto)
  items: WebhookItemDto[];
}
