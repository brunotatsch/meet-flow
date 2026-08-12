import { InvalidRoomDataError } from "./errors";

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 100;

export interface RoomProps {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  capacity: number;
  hourlyRateInCents: number;
  amenities: string[];
  photoUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoomProps {
  companyId: string;
  name: string;
  description?: string | null;
  capacity: number;
  hourlyRateInCents: number;
  amenities?: string[];
  photoUrl?: string | null;
}

/**
 * Entidade de domínio. Toda instância, recém-criada (`Room.create`) ou
 * reidratada do banco (`Room.restore`), respeita as invariantes: `name` entre
 * 3 e 100 caracteres, `capacity > 0`, `hourlyRateInCents >= 0`.
 */
export class Room {
  private constructor(private props: RoomProps) {}

  static create(input: CreateRoomProps): Room {
    const now = new Date();

    return new Room({
      id: crypto.randomUUID(),
      companyId: input.companyId,
      name: validateName(input.name),
      description: input.description ?? null,
      capacity: validateCapacity(input.capacity),
      hourlyRateInCents: validateHourlyRate(input.hourlyRateInCents),
      amenities: input.amenities ?? [],
      photoUrl: input.photoUrl ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: RoomProps): Room {
    return new Room(props);
  }

  get id(): string {
    return this.props.id;
  }

  get companyId(): string {
    return this.props.companyId;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get capacity(): number {
    return this.props.capacity;
  }

  get hourlyRateInCents(): number {
    return this.props.hourlyRateInCents;
  }

  get amenities(): string[] {
    return this.props.amenities;
  }

  get photoUrl(): string | null {
    return this.props.photoUrl;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(name: string): void {
    this.props.name = validateName(name);
    this.touch();
  }

  changeDescription(description: string | null): void {
    this.props.description = description;
    this.touch();
  }

  changeCapacity(capacity: number): void {
    this.props.capacity = validateCapacity(capacity);
    this.touch();
  }

  changeHourlyRate(hourlyRateInCents: number): void {
    this.props.hourlyRateInCents = validateHourlyRate(hourlyRateInCents);
    this.touch();
  }

  changeAmenities(amenities: string[]): void {
    this.props.amenities = amenities;
    this.touch();
  }

  changePhotoUrl(photoUrl: string | null): void {
    this.props.photoUrl = photoUrl;
    this.touch();
  }

  activate(): void {
    this.props.isActive = true;
    this.touch();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}

function validateName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
    throw new InvalidRoomDataError(
      `name deve ter entre ${MIN_NAME_LENGTH} e ${MAX_NAME_LENGTH} caracteres.`,
    );
  }

  return trimmed;
}

function validateCapacity(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new InvalidRoomDataError("capacity deve ser um inteiro positivo.");
  }

  return capacity;
}

function validateHourlyRate(hourlyRateInCents: number): number {
  if (!Number.isInteger(hourlyRateInCents) || hourlyRateInCents < 0) {
    throw new InvalidRoomDataError("hourlyRateInCents deve ser um inteiro não negativo.");
  }

  return hourlyRateInCents;
}
